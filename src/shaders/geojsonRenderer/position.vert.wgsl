struct posNColor {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f
}

struct Vertex {
    position : vec2f,
};

@group(0) @binding(0) var<storage, read> pos : array<Vertex>;
@group(0) @binding(1) var<uniform> mvpMatrix : mat4x4<f32>;
@group(0) @binding(2) var<uniform> translation : vec2f;

@vertex
fn main(
@builtin(vertex_index) vertexIndex : u32,
) -> posNColor {

    var vsOutput : posNColor;
    vsOutput.position = mvpMatrix * vec4f(pos[vertexIndex].position + translation, 0.0, 1.0);
    vsOutput.color = vec4f(1.0);
    return vsOutput;
}
