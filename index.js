var glslify = require('glslify')
var Regl = require('regl')
var load = require('resl')
var Camera = require('regl-camera')
var Mat4 = require('gl-mat4')
var Vec3 = require('gl-vec3')
var FullScreenQuad = require('full-screen-quad')

var regl = Regl({
  extensions: [ 'OES_standard_derivatives' ]
})

load({
  manifest: {
    diffuse: {
      type: 'image',
      src: 'textures/brick-diffuse.jpg'
    },
    normal: {
      type: 'image',
      src: 'textures/brick-normal.png'
    } 
  },
  onDone: launch
})

function launch ({ normal, diffuse }) {
  var render = regl({
    vert: glslify`
      #pragma glslify: transpose = require(glsl-transpose)
      #pragma glslify: inverse = require(glsl-inverse)

      attribute vec4 a_position;
      attribute vec3 a_normal;
      attribute vec2 a_tx_coord;

      uniform mat4 projection;
      uniform mat4 view;

      varying vec3 v_position;
      varying vec3 v_normal;
      varying vec2 v_tx_coord;

      void main () {
        mat4 mv_matrix = view;
        mat3 normal_matrix = transpose(inverse(mat3(mv_matrix)));
        vec4 mv_pos = mv_matrix * a_position;

        v_position = mv_pos.xyz;
        v_normal = normal_matrix * a_normal;
        v_tx_coord = a_tx_coord;
        gl_Position = projection * mv_pos;
      } 
    `,
    frag: glslify`
      precision highp float; 

      #pragma glslify: to_linear = require(glsl-gamma/in)
      #pragma glslify: to_gamma = require(glsl-gamma/out)

      uniform vec3 u_light;
      uniform sampler2D u_diffuse;
      uniform sampler2D u_normal;
      uniform float u_shininess;
      uniform vec3 eye;

      varying vec3 v_position;
      varying vec3 v_normal;
      varying vec2 v_tx_coord;

      const vec3 ambient_color = vec3(0.2, 0.0, 0.0);
      const vec3 specular_color = vec3(1.0, 1.0, 1.0);

      void main() {
        vec3 eye_dir = normalize(eye - v_position);
        vec3 light_dir = normalize(u_light - v_position);
        vec3 color = to_linear(texture2D(u_diffuse, v_tx_coord)).rgb;
        vec3 normal = to_linear(texture2D(u_normal, v_tx_coord)).rgb; // TODO: not used yet.  this is for normal-mapping
        vec3 half_dir = normalize(light_dir + eye_dir);
        float diffuse = max(dot(v_normal, light_dir), 0.0);
        float specular = pow(max(dot(half_dir, v_normal), 0.0), u_shininess);

        gl_FragColor.rgb = (.05 + diffuse) * color;
        gl_FragColor.rgb += specular * specular_color;
        gl_FragColor.a = 1.;
        gl_FragColor = to_gamma(gl_FragColor);
        gl_FragColor = clamp(gl_FragColor, 0., 1.);
      }
    `,
    cull: {
      enable: true 
    },
    count: regl.prop('geometry.count'),
    uniforms: {
      u_diffuse: regl.prop('geometry.diffuse'),
      u_normal: regl.prop('geometry.normal'),
      u_shininess: regl.prop('geometry.shininess'),
      u_light: regl.prop('light')
    },
    attributes: {
      a_position: regl.prop('geometry.vertices'),
      a_normal: regl.prop('geometry.normals'),
      a_tx_coord: regl.prop('geometry.texCoords')
    }
  })

  var vertices = new FullScreenQuad(4)
  var normals = [
    0, 0, 1,  
    0, 0, 1,  
    0, 0, 1,  
    0, 0, 1,  
    0, 0, 1,  
    0, 0, 1,  
  ]
  var texCoords = [ 
    1, 1, 
    0, 1, 
    1, 0,
    0, 1,
    0, 0,
    1, 0
  ]
  var wall = {
    vertices: regl.buffer(vertices),
    normals: regl.buffer(normals),
    texCoords: regl.buffer(texCoords),
    diffuse: regl.texture(diffuse),
    normal: regl.texture(normal),
    shininess: 200,
    count: 6
  }
  var camera = Camera(regl, {
    distance: 4,
    theta: Math.PI / 2 // TODO: regl-camera default is ZY plane
  })
  var light = [ 0, 0, 10 ]
  var clearProps = { color: [ 0, 0, 0, 1 ] }

  regl.frame(function ({ tick, time, viewportWidth, viewportHeight }) {
    regl.clear(clearProps)
    light[0] = Math.sin(time) * 10
    // light[2] = Math.cos(time) * 10
    camera(_ => render({ geometry: wall, light: light }))
  })
}
