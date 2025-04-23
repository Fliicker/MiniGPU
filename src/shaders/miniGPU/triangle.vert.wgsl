struct posNColor {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f
}

@group(0) @binding(0) var<storage, read> pos : array<vec2f, 3>;
@group(0) @binding(1) var<uniform> translation : vec2f;

@vertex
fn main(
@builtin(vertex_index) vertexIndex : u32,
@builtin(instance_index) instanceIndex : u32
) -> posNColor {
    var color = array<vec4f, 3 > (vec4f(1, 0, 0, 1), vec4f(0, 1, 0, 1), vec4f(0, 0, 1, 1));

    var vsOutput : posNColor;
    vsOutput.position = vec4f(pos[vertexIndex + instanceIndex * 3] + translation, 0.0, 1.0);
    vsOutput.color = color[vertexIndex];
    return vsOutput;
}
