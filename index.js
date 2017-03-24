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

function texture (regl, img) {
  return regl.texture({
    data: img,
    wrapS: 'repeat',
    wrapT: 'repeat',
    mag: 'linear',
    min: 'linear mipmap linear'
  })
}

load({
  manifest: {
    diffuse: {
      type: 'image',
      src: 'textures/stone.jpg'
    },
    normal: {
      type: 'image',
      src: 'textures/stone_NRM.jpg'
    },
    specular: {
      type: 'image',
      src: 'textures/stone_SPEC.png' 
    },
    displacement: {
      type: 'image',
      src: 'textures/stone_DISP.png' 
    }
  },
  onDone: launch
})

function launch ({ normal, diffuse, specular, displacement }) {
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
      #pragma glslify: phong_specular = require(glsl-specular-phong)
      #pragma glslify: oren_nayar_diffuse = require(glsl-diffuse-oren-nayar)
      #pragma glslify: attenuation = require(./attenuation)

      uniform mat4 view;
      uniform vec3 u_light;
      uniform vec3 eye;
      uniform sampler2D u_diffuse;
      uniform sampler2D u_normal;
      uniform sampler2D u_specular;
      uniform sampler2D u_displacement;
      uniform float u_shininess;
      uniform float u_roughness;
      uniform float u_albedo;
      uniform float u_tiling_factor;

      varying vec3 v_position;
      varying vec3 v_normal;
      varying vec2 v_tx_coord;

      const float light_radius = 10.;
      const float light_falloff = .1;
      const vec3 specular_color = vec3(1.0, 1.0, 1.0);
      const vec3 black = vec3(0);

      void main() {
        vec2 tile_tx = v_tx_coord * u_tiling_factor;

        vec3 eye_dir = normalize(-v_position);

        vec3 v_light = (view * vec4(u_light, 1)).xyz;
        vec3 light_vector = v_light - v_position;
        vec3 light_dir = normalize(light_vector);
        float light_dist = length(light_vector);

        vec3 diffuse_color = to_linear(texture2D(u_diffuse, tile_tx)).rgb;
        vec3 normal_map = 2. * to_linear(texture2D(u_normal, tile_tx)).rgb - 1.;
        vec3 adjusted_normal = perturb_normal(normal_map, v_normal, eye_dir, v_tx_coord);
        float specular_map = to_linear(texture2D(u_specular, tile_tx)).r;

        float diffuse_factor = oren_nayar_diffuse(light_dir, v_position, adjusted_normal, u_roughness, u_albedo);
        float specular_factor = specular_map * phong_specular(light_dir, eye_dir, adjusted_normal, u_shininess);
        float falloff = attenuation(light_radius, light_falloff, light_dist);

        gl_FragColor.rgb = diffuse_color * diffuse_factor * falloff;
        gl_FragColor.rgb += specular_color * specular_factor * falloff;
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
      u_specular: regl.prop('geometry.specular'),
      u_displacement: regl.prop('geometry.displacement'),
      u_shininess: regl.prop('geometry.shininess'),
      u_roughness: regl.prop('geometry.roughess'),
      u_albedo: regl.prop('geometry.albedo'),
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
    diffuse: texture(regl, diffuse),
    normal: texture(regl, normal),
    specular: texture(regl, specular),
    displacement: texture(regl, displacement),
    shininess: 60,
    albedo: .95,
    roughess: 1, 
    tiling_factor: 1,
    count: 6
  }
  var camera = Camera(regl, {
    distance: 3,
    theta: Math.PI / 2 // regl-camera default is ZY plane
  })
  var light = [ 0, 0, 2 ]
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
    renderProps.light[0] = Math.sin(time) * 2
    renderProps.light[1] = Math.cos(time) * 2
    renderProps.time = time
    regl.clear(clearProps)
    camera(_ => render(renderProps))
  })
}
