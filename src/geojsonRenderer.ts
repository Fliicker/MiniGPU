import positionVert from './shaders/geojsonRenderer/position.vert.wgsl?raw'
import lineVert from './shaders/geojsonRenderer/line.vert.wgsl?raw'
import layerFrag from './shaders/geojsonRenderer/layer.frag.wgsl?raw'
import lineFrag from './shaders/geojsonRenderer/line.frag.wgsl?raw'
import axios from "axios";
import * as turf from "@turf/turf";
import * as geojsonUtils from './util/geojson'
import { mat4, vec3, vec4 } from 'gl-matrix'

const translation = new Float32Array([0, 0]);

const cameraState = {
    position: [0, 0, 0],
    up: [0, 1, 0],
    target: [0, 0, 0],
};

const perspectiveState = {
    fov: 45 * Math.PI / 180,
    aspect: 0,
    near: 10,
    far: 500,
};

const modelData = {
    vertices: new Float32Array(),
    lines: [] as Float32Array[]
};


// initialize webgpu device & config canvas context
async function initWebGPU(canvas: HTMLCanvasElement) {
    if (!navigator.gpu)
        throw new Error('Not Support WebGPU')
    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
        // powerPreference: 'low-power'
    })
    if (!adapter)
        throw new Error('No Adapter Found')
    const device = await adapter.requestDevice()
    const context = canvas.getContext('webgpu') as GPUCanvasContext
    const format = navigator.gpu.getPreferredCanvasFormat()
    const devicePixelRatio = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * devicePixelRatio
    canvas.height = canvas.clientHeight * devicePixelRatio
    const size = { width: canvas.width, height: canvas.height }
    context.configure({
        // json specific format when key and value are the same
        device, format,
        // prevent chrome warning
        alphaMode: 'opaque'
    })
    return { device, context, format, size }
}

async function initModelData() {
    const geojson = (await axios.get("/geojson/China.json")).data;
    // var geojson = turf.simplify(geojsonRaw, { tolerance: 100, highQuality: false });
    const center = turf.center(geojson).geometry.coordinates;
    cameraState.position = [center[0], center[1], 40];
    cameraState.target = [center[0], center[1], 0];
    modelData.vertices = geojsonUtils.getVertices(geojson);
    modelData.lines = geojsonUtils.getLines(geojson);

    console.log(modelData)
}

async function initPipeline(device: GPUDevice, format: GPUTextureFormat) {
    const descriptor: GPURenderPipelineDescriptor = {
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({
                code: positionVert
            }),
            entryPoint: 'main'
        },
        primitive: {
            topology: 'triangle-list' // try point-list, line-list, line-strip, triangle-strip?
        },
        fragment: {
            module: device.createShaderModule({
                code: layerFrag
            }),
            entryPoint: 'main',
            targets: [
                {
                    format: format
                }
            ]
        }
    }

    // 创建明确的管线布局
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'read-only-storage'
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform'
                }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform'
                }
            }
        ]
    });

    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
    });

    // 修改管线描述符使用明确的布局
    // TODO: WHY??
    descriptor.layout = pipelineLayout;

    const pipeline = await device.createRenderPipelineAsync(descriptor)

    descriptor.primitive!.topology = 'line-strip'
    descriptor.vertex!.module = device.createShaderModule({code: lineVert})
    descriptor.fragment!.module = device.createShaderModule({code: lineFrag})
    const linePipeline = await device.createRenderPipelineAsync(descriptor)

    const posBuffer = device.createBuffer({
        label: 'storage for positions',
        size: modelData.vertices.length * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const translationBuffer = device.createBuffer({
        label: 'uniform for translation',
        size: 8,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })

    const mvpBuffer = device.createBuffer({
        label: 'uniform for mvpMatrix',
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })

    const bindGroup = device.createBindGroup({
        label: `bind group for uniform buffer`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: posBuffer } },
            { binding: 1, resource: { buffer: mvpBuffer } },
            { binding: 2, resource: { buffer: translationBuffer } },
        ],
    });

    return { pipeline, linePipeline, translationBuffer, posBuffer, mvpBuffer, bindGroup }
}


// create & submit device commands
function draw(device: GPUDevice,
    context: GPUCanvasContext,
    pipelineObj: {
        pipeline: GPURenderPipeline
        linePipeline: GPURenderPipeline
        translationBuffer: GPUBuffer
        posBuffer: GPUBuffer
        mvpBuffer: GPUBuffer
        bindGroup: GPUBindGroup
    }) {
    const commandEncoder = device.createCommandEncoder()
    const view = context.getCurrentTexture().createView()
    const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
            {
                view: view,
                clearValue: [0.3, 0.3, 0.3, 1],
                loadOp: 'clear', // clear/load
                storeOp: 'store' // store/discard
            }
        ]
    }

    const mvpMatrix = mat4.create()
    const viewMatrix = genViewMatrix()
    const projectionMatrix = genProjectionMatrix()
    mat4.multiply(mvpMatrix, projectionMatrix, viewMatrix);

    /// test ///
    console.log('mvp:', mvpMatrix)
    console.log('view:', viewMatrix)
    console.log('projection:', projectionMatrix)
    let testVec4 = vec4.fromValues(117.38987731933594, 40.56159210205078, 0, 1)
    const result = vec4.create()
    vec4.transformMat4(result, testVec4, mvpMatrix)
    console.log(result)
    ///////////

    device.queue.writeBuffer(pipelineObj.posBuffer, 0, modelData.vertices)
    device.queue.writeBuffer(pipelineObj.translationBuffer, 0, translation)
    device.queue.writeBuffer(pipelineObj.mvpBuffer, 0, new Float32Array(mvpMatrix))

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
    passEncoder.setPipeline(pipelineObj.pipeline)
    passEncoder.setBindGroup(0, pipelineObj.bindGroup)
    // 3 vertex form a triangle
    passEncoder.draw(modelData.vertices.length / 2)

    passEncoder.setPipeline(pipelineObj.linePipeline)
    let offset = 0;
    modelData.lines.forEach((line) => {
        passEncoder.draw(line.length / 2, 1, offset)
        offset += line.length * 2
    });

    passEncoder.end()
    // webgpu run in a separate process, all the commands will be executed after submit
    device.queue.submit([commandEncoder.finish()])
}

function genViewMatrix() {
    const cameraMatrix = mat4.create();
    const position = vec3.fromValues(cameraState.position[0], cameraState.position[1], cameraState.position[2])
    const target = vec3.fromValues(cameraState.target[0], cameraState.target[1], cameraState.target[2])
    const up = vec3.fromValues(cameraState.up[0], cameraState.up[1], cameraState.up[2])

    mat4.lookAt(cameraMatrix, position, target, up)

    return cameraMatrix
}

function genProjectionMatrix() {
    const { fov, aspect, near, far } = perspectiveState;
    const projectionMatrix = mat4.create()
    mat4.perspective(
        projectionMatrix,
        fov,
        aspect,
        near,
        far
    );
    return projectionMatrix
}

async function run() {

    const canvas = document.querySelector('canvas')
    if (!canvas)
        throw new Error('No Canvas')
    const { device, context, format, size } = await initWebGPU(canvas)

    perspectiveState.aspect = size.width / size.height

    await initModelData();
    const pipelineObj = await initPipeline(device, format)

    const drawLayer = () => {
        draw(device, context, pipelineObj)
    }

    // start draw
    drawLayer()

    // re-configure context on resize
    window.addEventListener('resize', () => {
        canvas.width = canvas.clientWidth * devicePixelRatio
        canvas.height = canvas.clientHeight * devicePixelRatio
        // don't need to recall context.configure() after v104
        drawLayer()
    })

    document.querySelector('#tx')?.addEventListener('input', (e: Event) => {
        translation[0] = +(e.target as HTMLInputElement).value
        drawLayer()
    })
    document.querySelector('#ty')?.addEventListener('input', (e: Event) => {
        translation[1] = +(e.target as HTMLInputElement).value
        drawLayer()
    })
}
run()

