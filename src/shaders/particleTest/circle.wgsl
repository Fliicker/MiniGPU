struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) worldPos: vec4f,
    @location(1) center: vec4f,
    @location(2) radius: f32
}

@group(0) @binding(0) var<uniform> mvp: mat4x4<f32>;
@group(0) @binding(1) var<storage, read> center: array<f32>;
@group(0) @binding(2) var<storage, read> radius: array<f32>;

@vertex
fn vsMain(
    @builtin(vertex_index) vertexIndex : u32,
    @builtin(instance_index) instanceIndex : u32
) -> VSOut {
    let centerX = center[instanceIndex * 2];
    let centerY = center[instanceIndex * 2 + 1];
    let r = radius[instanceIndex];

    let polarity = array<vec2f, 4>(
        vec2f(-1.0, -1.0),
        vec2f( 1.0, -1.0),
        vec2f(-1.0,  1.0),
        vec2f( 1.0,  1.0)
    );
    let xy = vec2f(centerX, centerY) + r * polarity[vertexIndex];

    var out: VSOut;
    out.worldPos = vec4f(xy, 0, 1);      //TODO: z-fight?
    out.pos = mvp * out.worldPos;
    out.center = vec4f(centerX, centerY, 0, 1);
    out.radius = r;

    return out;
}

@fragment
fn fsMain(
    in:VSOut 
) -> @location(0) vec4f {
    if (distance(in.worldPos, in.center) > in.radius) {
        discard;
    }
    return vec4f(0, 0, 0, 1);
}