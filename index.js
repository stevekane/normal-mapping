var Regl = require('regl')
var load = require('resl')
var Camera = require('regl-camera')
var Mat4 = require('gl-mat4')
var Vec3 = require('gl-vec3')
var FullScreenQuad = require('full-screen-quad')

var regl = Regl()

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
    vert: `
      attribute vec4 a_position;
      attribute vec3 a_normal;
      attribute vec2 a_tx_coord;

      uniform mat4 projection;
      uniform mat4 view;

      varying vec3 v_normal;
      varying vec2 v_tx_coord;

      void main () {
        v_normal = a_normal;
        v_tx_coord = a_tx_coord;
        gl_Position = projection * view * a_position;
      } 
    `,
    frag: `
      precision mediump float; 

      uniform sampler2D u_diffuse;
      uniform sampler2D u_normal;

      varying vec3 v_normal;
      varying vec2 v_tx_coord;

      void main () {
        vec4 diff = texture2D(u_diffuse, v_tx_coord);

        gl_FragColor = diff;
      }
    `,
    cull: {
      enable: true 
    },
    count: regl.prop('geometry.count'),
    uniforms: {
      u_diffuse: regl.prop('geometry.diffuse'),
      u_normal: regl.prop('geometry.normal')
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
    count: 6
  }
  var camera = Camera(regl, {
    theta: Math.PI / 2 // TODO: regl-camera default is ZY plane
  })

  regl.frame(function ({ tick, time, viewportWidth, viewportHeight }) {
    var theta = Math.sin(time) * 2 * Math.PI
    camera(_ => render({ geometry: wall }))
    console.log(theta)
  })
}
