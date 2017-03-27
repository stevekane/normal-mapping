var glslify = require('glslify')
var Regl = require('regl')
var load = require('resl')
var Camera = require('regl-camera')
var Mat4 = require('gl-mat4')
var Vec3 = require('gl-vec3')
var Quat = require('gl-quat')
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
      src: 'textures/stone_COLOR.png'
    },
    normal: {
      type: 'image',
      src: 'textures/stone_NRM.png'
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
      attribute vec3 a_tangent;
      attribute vec3 a_bitangent;
      attribute vec2 a_tx_coord;

      uniform float u_time;
      uniform mat4 projection;
      uniform mat4 view;
      uniform mat4 u_model;
      uniform vec3 u_light;
      uniform vec3 eye;

      varying vec3 v_world_frag_pos;
      varying vec3 v_view_position;
      varying vec3 v_tangent_eye_position;
      varying vec3 v_tangent_light_position;
      varying vec3 v_tangent_frag_position;
      varying vec2 v_tx_coord;

      void main () {
        mat3 normal_matrix = mat3(u_model);
        vec3 T = normalize(normal_matrix * a_tangent);
        vec3 B = normalize(normal_matrix * a_bitangent);
        vec3 N = normalize(normal_matrix * a_normal);
        mat3 TBN = transpose(mat3(T, B, N));

        v_world_frag_pos = vec3(u_model * a_position);
        v_tangent_eye_position = TBN * eye;
        v_tangent_light_position = TBN * u_light;
        v_tangent_frag_position = TBN * v_world_frag_pos;
        v_tx_coord = a_tx_coord;

        gl_Position = projection * view * u_model * a_position;
      } 
    `,
    frag: glslify`
      #extension GL_OES_standard_derivatives : enable

      precision highp float; 

      #pragma glslify: to_linear = require(glsl-gamma/in)
      #pragma glslify: to_gamma = require(glsl-gamma/out)
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
      uniform float u_height_scale;
      uniform bool u_normal_mapping;
      uniform bool u_parallax_mapping;
      uniform bool u_debug_height;

      varying vec3 v_world_frag_pos;
      varying vec3 v_view_position;
      varying vec3 v_tangent_eye_position;
      varying vec3 v_tangent_light_position;
      varying vec3 v_tangent_frag_position;
      varying vec2 v_tx_coord;

      const float light_radius = 2.;
      const float light_falloff = .1;
      const float ambient_factor = 0.02;
      const vec3 specular_color = vec3(1.);

      vec2 parallax_mapping ( float scale, float height, vec3 view_dir, vec2 tx ) {
        vec2 p = ( view_dir.xy / view_dir.z ) * ( height * scale );
              
        return tx - p; 
      }

      void main () {
        vec3 view_dir = normalize(v_tangent_eye_position - v_tangent_frag_position);
        vec3 light_dir = normalize(v_tangent_light_position - v_tangent_frag_position);
        vec3 light_vector = u_light - v_world_frag_pos;
        vec2 tx = v_tx_coord * u_tiling_factor;
        float light_dist = length(light_vector);
        float height = 1. - texture2D(u_displacement, tx).r;

        // parallax-mapping
        if ( u_parallax_mapping ) {
          tx = parallax_mapping(u_height_scale, height, view_dir, tx);
        }
        
        // normal-mapping. normal in tangent-space
        vec3 normal;
        if ( u_normal_mapping ) {
          normal = normalize(texture2D(u_normal, tx).xyz * 2. - 1.); 
        }
        else {
          normal = vec3(0, 0, 1);
        }

        // diffuse and specular map
        vec3 diffuse_color = to_linear(texture2D(u_diffuse, tx)).rgb;
        float specular_map = to_linear(texture2D(u_specular, tx)).r;

        float diffuse_factor = max(dot(light_dir, normal), 0.);
        float specular_factor = specular_map * phong_specular(light_dir, view_dir, normal, u_shininess);
        float falloff = attenuation(light_radius, light_falloff, light_dist);
        vec3 color = ambient_factor * diffuse_color;
        
        color += diffuse_color * diffuse_factor * falloff;
        color += specular_color * specular_factor * falloff;
        color = to_gamma(color);
        gl_FragColor = vec4(color, 1.);
      }
    `,
    cull: {
      enable: true 
    },
    count: regl.prop('geometry.count'),
    uniforms: {
      u_time: regl.prop('time'),
      u_model: regl.prop('geometry.modelMatrix'),
      u_diffuse: regl.prop('geometry.diffuse'),
      u_normal: regl.prop('geometry.normal'),
      u_specular: regl.prop('geometry.specular'),
      u_displacement: regl.prop('geometry.displacement'),
      u_shininess: regl.prop('geometry.shininess'),
      u_roughness: regl.prop('geometry.roughess'),
      u_albedo: regl.prop('geometry.albedo'),
      u_tiling_factor: regl.prop('geometry.tilingFactor'),
      u_light: regl.prop('light'),
      u_normal_mapping: regl.prop('normalMapping'),
      u_parallax_mapping: regl.prop('parallaxMapping'),
      u_debug_height: regl.prop('debugHeight'),
      u_height_scale: regl.prop('heightScale')
    },
    attributes: {
      a_position: regl.prop('geometry.vertices'),
      a_normal: regl.prop('geometry.normals'),
      a_tangent: regl.prop('geometry.tangents'),
      a_bitangent: regl.prop('geometry.bitangents'),
      a_tx_coord: regl.prop('geometry.texCoords')
    }
  })

  var vertices = new FullScreenQuad(4)
  var texCoords = [ 
    1, 1, 
    0, 1, 
    1, 0,
    0, 1,
    0, 0,
    1, 0
  ]
  var normals = []
  var tangents = []
  var bitangents = []
  
  for ( var i = 0; i < 6; i++ ) {
    normals.push(0, 0, 1) 
    tangents.push(1, 0, 0)
    bitangents.push(0, 1, 0)
  }

  var wall = {
    position: Vec3.create(),
    rotation: Quat.create(),
    modelMatrix: Mat4.create(),
    vertices: regl.buffer(vertices),
    normals: regl.buffer(normals),
    tangents: regl.buffer(tangents),
    bitangents: regl.buffer(bitangents),
    texCoords: regl.buffer(texCoords),
    diffuse: texture(regl, diffuse),
    normal: texture(regl, normal),
    specular: texture(regl, specular),
    displacement: texture(regl, displacement),
    shininess: 50,
    albedo: .95,
    roughess: 1, 
    tilingFactor: 2,
    count: 6
  }
  var camera = Camera(regl, {
    distance: 2.5,
    theta: Math.PI / 2, // regl-camera default is ZY plane
  })
  var light = [ 0, 0, .4 ]
  var clearProps = { 
    color: [ 0, 0, 0, 1 ],
    depth: 1
  }    
  var renderProps = {
    geometry: wall,
    light: light,
    time: 0,
    parallaxMapping: true,
    normalMapping: true,
    debugHeight: false,
    heightScale: 0.006
  }

  window.r = renderProps
  regl.frame(function ({ tick, time, viewportWidth, viewportHeight }) {
    renderProps.light[0] = Math.sin(time)
    renderProps.light[1] = Math.cos(time)
    renderProps.time = time
    // wall.position[0] = Math.cos(time)
    // wall.position[2] = Math.sin(time)
    // Quat.rotateZ(wall.rotation, wall.rotation, Math.PI / 128)
    Mat4.fromRotationTranslation(wall.modelMatrix, wall.rotation, wall.position)
    regl.clear(clearProps)
    camera(_ => render(renderProps))
  })
}
