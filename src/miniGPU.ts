import triangleVert from './shaders/miniGPU/triangle.vert.wgsl?raw'
import redFrag from './shaders/miniGPU/red.frag.wgsl?raw'

const translation = new Float32Array([0, 0]);

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
// create a simple pipiline
async function initPipeline(device: GPUDevice, format: GPUTextureFormat) {
    const descriptor: GPURenderPipelineDescriptor = {
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({
                code: triangleVert
            }),
            entryPoint: 'main'
        },
        primitive: {
            topology: 'triangle-list' // try point-list, line-list, line-strip, triangle-strip?
        },
        fragment: {
            module: device.createShaderModule({
                code: redFrag
            }),
            entryPoint: 'main',
            targets: [
                {
                    format: format
                }
            ]
        }
    }

    const pipeline = await device.createRenderPipelineAsync(descriptor)

    const uniformBuffer = device.createBuffer({
        label: 'uniform for translation',
        size: 8,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })

    const posBuffer = device.createBuffer({
        label: 'storage for positions',
        size: 48,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
        label: `bind group for uniform buffer`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: posBuffer } },
            { binding: 1, resource: { buffer: uniformBuffer } },
        ],
    });

    return { pipeline, uniformBuffer, posBuffer, bindGroup }
}
// create & submit device commands
function draw(device: GPUDevice,
    context: GPUCanvasContext,
    pipelineObj: {
        pipeline: GPURenderPipeline
        uniformBuffer: GPUBuffer
        posBuffer: GPUBuffer
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

    device.queue.writeBuffer(pipelineObj.posBuffer, 0, new Float32Array([0.0, 0.2, -0.2, -0.2, 0.2, -0.2, 0.5, 0.7, 0.3, 0.3, 0.7, 0.3]))
    device.queue.writeBuffer(pipelineObj.uniformBuffer, 0, translation);

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
    passEncoder.setPipeline(pipelineObj.pipeline)
    passEncoder.setBindGroup(0, pipelineObj.bindGroup);
    // 3 vertex form a triangle
    passEncoder.draw(3, 2)
    passEncoder.end()
    // webgpu run in a separate process, all the commands will be executed after submit
    device.queue.submit([commandEncoder.finish()])
}

async function run() {

    const canvas = document.querySelector('canvas')
    if (!canvas)
        throw new Error('No Canvas')
    const { device, context, format } = await initWebGPU(canvas)
    const pipelineObj = await initPipeline(device, format)

    const drawTriangle = () => {
        draw(device, context, pipelineObj)
    }

    // start draw
    drawTriangle()

    // re-configure context on resize
    window.addEventListener('resize', () => {
        canvas.width = canvas.clientWidth * devicePixelRatio
        canvas.height = canvas.clientHeight * devicePixelRatio
        // don't need to recall context.configure() after v104
        drawTriangle()
    })

    document.querySelector('#tx')?.addEventListener('input', (e: Event) => {
        translation[0] = +(e.target as HTMLInputElement).value
        drawTriangle()
    })
    document.querySelector('#ty')?.addEventListener('input', (e: Event) => {
        translation[1] = +(e.target as HTMLInputElement).value
        drawTriangle()
    })
}
run()

