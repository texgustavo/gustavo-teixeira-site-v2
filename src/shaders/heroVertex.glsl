// Vertex shader pra plano fullscreen (rawShaderMaterial GLSL3).
// Three.js JÁ INJETA `#version 300 es` automaticamente quando glslVersion=THREE.GLSL3 — NÃO adicionar aqui.
// Three.js fornece `position` como vec3; convertemos pra vec4 e enviamos como clip space.
precision highp float;
in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}
