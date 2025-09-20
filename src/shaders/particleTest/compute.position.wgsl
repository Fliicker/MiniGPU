@group(0) @binding(0) var<storage, read_write> center: array<f32>;
@group(0) @binding(1) var<storage, read_write> velocity: array<f32>;
@group(0) @binding(2) var<storage, read> radius: array<f32>;
@group(0) @binding(3) var<uniform> boxBound: vec4f;    // xmin, ymin, xmax, ymax

fn checkCollision(bound: vec4f, center: vec2f, radius: f32) -> vec2<i32> {
    let left   = (center[0] - radius <= bound[0]);
    let right  = (center[0] + radius >= bound[2]);
    let bottom = (center[1] - radius <= bound[1]);
    let top    = (center[1] + radius >= bound[3]);

    // 0 or 1
    return vec2<i32>(
        i32(left) + i32(right), 
        i32(bottom) + i32(top)
    );
}


@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
    let index = GlobalInvocationID.x;

    let centerX = center[index * 2];
    let centerY = center[index * 2 + 1];
    let velocityX = velocity[index * 2];
    let velocityY = velocity[index * 2 + 1];
    let r = radius[index];

    let nextCenter = vec2f(centerX, centerY) + vec2f(velocityX, velocityY);

    // Find the nearest circle
    // let p = vec2f(center[index * 2], center[index * 2 + 1]);
    // var minDist = 1e20;
    // var minIdx: u32 = 0u;

    // for (var j: u32 = 0u; j < arrayLength(&center) / 2; j = j + 1u) {
    //     if (j == index) {
    //         continue;
    //     }
    //     let q = vec2f(center[j * 2], center[j * 2 + 1]);
    //     let d = distance(p, q) - r[index] - r[j];
    //     if (d < minDist) {
    //         minDist = d;
    //         minIdx = j;
    //     }
    // }

    
    let collision = checkCollision(boxBound, nextCenter, radius[index]);

    velocity[index * 2] = velocityX * (1.0 - f32(collision[0]) * 2.0);
    velocity[index * 2 + 1] = velocityY * (1.0 - f32(collision[1]) * 2.0);

    center[index * 2] = nextCenter[0];
    center[index * 2 + 1] = nextCenter[1];
}
