#include <metal_stdlib>
using namespace metal;
struct VertexOut {float4 position [[position]];float2 uv;};
vertex VertexOut stereoVertex(uint id [[vertex_id]]) {
    float2 p[3]={float2(-1,-1),float2(3,-1),float2(-1,3)};
    VertexOut out;out.position=float4(p[id],0,1);out.uv=float2((p[id].x+1)*0.5,1-(p[id].y+1)*0.5);return out;
}
fragment half4 stereoFragment(VertexOut in [[stage_in]],texture2d<half> left [[texture(0)]],texture2d<half> right [[texture(1)]],constant float4 &lens [[buffer(0)]],constant float &shade [[buffer(1)]]) {
    bool rightEye=in.uv.x>=0.5;float2 uv=float2(fract(in.uv.x*2),in.uv.y);float2 p=(uv-lens.zw)*2;
    float r2=dot(p,p);float2 source=lens.zw+p*(1+lens.x*r2+lens.y*r2*r2)*0.5;
    if(any(source<0)||any(source>1))return half4(0,0,0,1);
    constexpr sampler s(filter::linear,address::clamp_to_edge);
    half4 color = rightEye ? right.sample(s,source):left.sample(s,source);
    return half4(color.rgb * half(1.0 - shade), color.a);
}
