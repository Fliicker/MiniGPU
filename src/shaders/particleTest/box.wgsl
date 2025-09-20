@group(0) @binding(0) var<uniform> boxBound:vec4f;  // xmin, ymin, xmax, ymax
@group(0) @binding(1) var<uniform> mvp:mat4x4<f32>;

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    let xIndex = (vertexIndex % 2u) * 2;  // 0, 2, 0, 2
    let yIndex = (vertexIndex / 2u) * 2 + 1;  // 1, 1, 3, 3
    return mvp * vec4f(boxBound[xIndex], boxBound[yIndex], 0, 1);
}

@fragment
fn fsMain() -> @location(0) vec4f {
    return vec4f(1, 1, 1, 1);
}