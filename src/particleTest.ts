import boxShader from './shaders/particleTest/box.wgsl?raw'
import circleShader from './shaders/particleTest/circle.wgsl?raw'
import computeShader from './shaders/particleTest/compute.position.wgsl?raw'

import { getProjectionMatrix } from './util/math'

let NUM = 100

async function initWebGPU(canvas: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
        return null
    }
    const device = await adapter.requestDevice({
        requiredLimits: {
            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize
        }
    })

    const context = canvas.getContext('webgpu')
    if (!context) {
        return null
    }

    const format = navigator.gpu.getPreferredCanvasFormat()

    const devicePixelRatio = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * devicePixelRatio
    canvas.height = canvas.clientHeight * devicePixelRatio
    const size = { width: canvas.width, height: canvas.height }

    context.configure({
        device, format,
        alphaMode: 'opaque'
    })
    return { device, context, format, size }
}

async function initPipeline(device: GPUDevice, format: GPUTextureFormat, size: { width: number, height: number }) {
    // Box Pipeline
    const boxPipeline = await device.createRenderPipelineAsync({
        label: 'box pipeline',
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({
                code: boxShader
            }),
            entryPoint: 'vsMain'
        },
        fragment: {
            module: device.createShaderModule({
                code: boxShader
            }),
            entryPoint: 'fsMain',
            targets: [
                {
                    format: format
                }
            ]
        },
        primitive: {
            topology: 'triangle-strip',
        }
    })

    const boxBoundBuffer = device.createBuffer({
        size: 4 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })

    const mvpBuffer = device.createBuffer({
        size: 4 * 4 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })

    const boxRenderGroup = device.createBindGroup({
        layout: boxPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: boxBoundBuffer
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: mvpBuffer
                }
            }
        ]
    })

    // Model Pipeline
    const modelPipeline = await device.createRenderPipelineAsync({
        label: 'model pipeline',
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({
                code: circleShader
            }),
            entryPoint: 'vsMain'
        },
        fragment: {
            module: device.createShaderModule({
                code: circleShader
            }),
            entryPoint: 'fsMain',
            targets: [
                {
                    format: format
                }
            ]
        },
        primitive: {
            topology: 'triangle-strip',
        }
    })

    const centerBuffer = device.createBuffer({
        size: 4 * 2 * NUM,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })

    const radiusBuffer = device.createBuffer({
        size: 4 * NUM,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })

    const modelRenderGroup = device.createBindGroup({
        layout: modelPipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: {
                buffer: mvpBuffer
            }
        }, {
            binding: 1,
            resource: {
                buffer: centerBuffer
            }
        }, {
            binding: 2,
            resource: {
                buffer: radiusBuffer
            }
        },]
    })

    // Compute Pipeline
    const computePipeline = await device.createComputePipelineAsync({
        layout: 'auto',
        compute: {
            module: device.createShaderModule({
                code: computeShader
            }),
            entryPoint: 'main'
        }
    })

    const velocityBuffer = device.createBuffer({
        size: 4 * 2 * NUM,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })

    const computeGroup = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: centerBuffer
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: velocityBuffer
                }
            },
            {
                binding: 2,
                resource: {
                    buffer: radiusBuffer
                }
            },
            {
                binding: 3,
                resource: {
                    buffer: boxBoundBuffer
                }
            }
        ]
    })

    return {
        boxPipeline, boxBoundBuffer, mvpBuffer, boxRenderGroup,
        modelPipeline, centerBuffer, radiusBuffer, modelRenderGroup,
        computePipeline, velocityBuffer, computeGroup
    }
}

async function run() {
    const canvas = document.querySelector('canvas')
    if (!canvas)
        throw new Error('No Canvas')
    const camera = { x: 0, y: -300, z: 1000 }

    const config = await initWebGPU(canvas)
    if (!config) {
        console.warn('WebGPU Config Error')
        return
    }
    const { device, context, format, size } = config
    const pipelineObj = await initPipeline(device, format, size)

    const boxBound = new Float32Array([-500, -500, 500, 500]);  // xmin, ymin, xmax, ymax
    device.queue.writeBuffer(pipelineObj.boxBoundBuffer, 0, boxBound)

    const aspect = size.width / size.height
    const mvpMatrix = getProjectionMatrix(aspect, 60 / 180 * Math.PI, -500, 500, camera)  //TODO: ?
    device.queue.writeBuffer(pipelineObj.mvpBuffer, 0, mvpMatrix)


    const modelArray = new Float32Array(NUM * 2)
    const velocityArray = new Float32Array(NUM * 2)
    const radiusArray = new Float32Array(NUM)
    for (let i = 0; i < NUM; i++) {
        modelArray[i * 2 + 0] = Math.random() * 900 - 450
        modelArray[i * 2 + 1] = Math.random() * 900 - 450
        velocityArray[i * 2 + 0] = Math.random() * 20 - 10
        velocityArray[i * 2 + 1] = Math.random() * 20 - 10
        radiusArray[i] = Math.random() * 20 + 10
    }
    device.queue.writeBuffer(pipelineObj.centerBuffer, 0, modelArray)
    device.queue.writeBuffer(pipelineObj.radiusBuffer, 0, radiusArray)
    device.queue.writeBuffer(pipelineObj.velocityBuffer, 0, velocityArray)

    function frame() {
        const commandEncoder = device.createCommandEncoder()

        const computePass = commandEncoder.beginComputePass()
        computePass.setPipeline(pipelineObj.computePipeline)
        computePass.setBindGroup(0, pipelineObj.computeGroup)
        computePass.dispatchWorkgroups(Math.ceil(NUM / 128))
        computePass.end()

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        })
        renderPass.setPipeline(pipelineObj.boxPipeline)
        renderPass.setBindGroup(0, pipelineObj.boxRenderGroup)
        renderPass.draw(4)

        renderPass.setPipeline(pipelineObj.modelPipeline)
        renderPass.setBindGroup(0, pipelineObj.modelRenderGroup)
        renderPass.draw(4, NUM)

        renderPass.end()
        device.queue.submit([commandEncoder.finish()])

        requestAnimationFrame(frame)

    }
    frame()

}

run()