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

      uniform float u_time;
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
      #extension GL_OES_standard_derivatives : enable

      precision highp float; 

      #pragma glslify: to_linear = require(glsl-gamma/in)
      #pragma glslify: to_gamma = require(glsl-gamma/out)
      #pragma glslify: perturb_normal = require(glsl-perturb-normal)
      #pragma glslify: attenuation = require(./attenuation)

      uniform mat4 view;
      uniform vec3 u_light;
      uniform vec3 eye;
      uniform sampler2D u_diffuse;
      uniform sampler2D u_normal;
      uniform float u_shininess;
      uniform float u_tiling_factor;

      varying vec3 v_position;
      varying vec3 v_normal;
      varying vec2 v_tx_coord;

      const float light_radius = .1;
      const float light_falloff = 3.;
      const float ambient_factor = .01;
      const vec3 ambient_color = vec3(.95);
      const vec3 specular_color = vec3(1.0, 1.0, 1.0);

      void main() {
        vec3 v_light = (view * vec4(u_light, 1)).xyz;
        vec2 tile_tx = v_tx_coord * u_tiling_factor;
        vec3 eye_dir = normalize(v_position);
        vec3 light_vector = v_light - v_position;
        vec3 light_dir = normalize(light_vector);
        vec3 diffuse_color = to_linear(texture2D(u_diffuse, tile_tx)).rgb;
        vec3 normal = to_linear(texture2D(u_normal, tile_tx)).rgb * 2. - 1.;
        vec3 adjusted_normal = perturb_normal(normal, v_normal, eye_dir, tile_tx);
        vec3 half_dir = normalize(light_dir + eye_dir);
        float light_dist = length(light_vector);
        float diffuse = max(dot(adjusted_normal, light_dir), 0.0);
        float specular = pow(max(dot(half_dir, adjusted_normal), 0.0), u_shininess);
        float falloff = attenuation(light_radius, light_falloff, light_dist);

        gl_FragColor.rgb = ambient_color * ambient_factor;
        gl_FragColor.rgb += diffuse * diffuse_color * falloff;
        gl_FragColor.rgb += specular * specular_color * falloff;
        gl_FragColor = to_gamma(gl_FragColor);
        gl_FragColor.a = 1.;
      }
    `,
    cull: {
      enable: true 
    },
    count: regl.prop('geometry.count'),
    uniforms: {
      u_time: regl.prop('time'),
      u_diffuse: regl.prop('geometry.diffuse'),
      u_normal: regl.prop('geometry.normal'),
      u_shininess: regl.prop('geometry.shininess'),
      u_tiling_factor: regl.prop('geometry.tiling_factor'),
      u_light: regl.prop('light'),
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
    diffuse: regl.texture({
      data: diffuse,
      wrapS: 'repeat',
      wrapT: 'repeat'
    }),
    normal: regl.texture({
      data: normal,
      wrapS: 'repeat',
      wrapT: 'repeat'
    }),
    shininess: 800,
    tiling_factor: 4,
    count: 6
  }
  var camera = Camera(regl, {
    distance: 4,
    theta: Math.PI / 2 // regl-camera default is ZY plane
  })
  var light = [ 0, 1, 10 ]
  var clearProps = { 
    color: [ 0, 0, 0, 1 ],
    depth: 1
  }    
  var renderProps = {
    geometry: wall,
    light: light,
    time: 0
  }

  window.wall = wall
  regl.frame(function ({ tick, time, viewportWidth, viewportHeight }) {
    regl.clear(clearProps)
    Vec3.copy(light, camera.eye)
    console.log(light)
    renderProps.time = time
    camera(_ => render(renderProps))
  })
}
