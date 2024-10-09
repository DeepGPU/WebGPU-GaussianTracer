import { Scene } from "./scene";
import { createMesh } from "./scene";
import { Mat4, mat4, } from 'wgpu-matrix';

var degree = 3.14159265358979323846 / 180.0;


export async function scene_gs(scene: Scene) {
  const tableMesh = await createMesh('table_wood.glb');
  scene.addMesh(
    'table', 
    tableMesh,
    // mat4.mul<Mat4>(mat4.translation([0, -1.5*tableMesh.aabb[1][1] - 0.148, 0]), mat4.uniformScaling(1.5))
    mat4.mul<Mat4>(mat4.translation([0, -3*tableMesh.aabb[1][1], 0]), mat4.uniformScaling(3))
  );

  
}


export async function scene_rainbow_lighting(scene: Scene) {
  // scene.clear();
  const tableMesh = await createMesh('table_wood.glb');
  scene.addMesh(
    'table', 
    tableMesh,
    // mat4.mul<Mat4>(mat4.translation([0, -1.5*tableMesh.aabb[1][1] - 0.148, 0]), mat4.uniformScaling(1.5))
    mat4.mul<Mat4>(mat4.translation([0, -3*tableMesh.aabb[1][1], 0]), mat4.uniformScaling(3))
  );

  const lucyMesh = await createMesh('../data/mesh/lucy.obj');
  const skeletonMesh = await createMesh('../data/mesh/skeleton.glb');
  const lucyScale = mat4.uniformScaling(0.1);
  const skeletonScale = mat4.uniformScaling(0.04);

  const rainbow = [
    [90, 0, 0],
    [90, 30, 0],
    [90, 90, 0],
    [0, 90, 0],
    [0, 0, 90],
    [10, 0, 80],
    [40, 0, 70]
  ];

  let colorScale = 1/100;
  let num = 7;
  let radius = 0.2;
  for (let i = 0; i < num; i++) {
    const x = Math.sin(i / num * Math.PI * 2);
    const z = Math.cos(i / num * Math.PI * 2);
    const m = scene.addMesh(
      `skeleton${i}`, 
      skeletonMesh,
      mat4.mul<Mat4>(mat4.translation([radius*x, 0.07, radius*z]), 
        mat4.mul(mat4.rotationY( i * (360/num) * degree), skeletonScale)),
      true
    ).getMaterial();
    m.emittance = [colorScale*rainbow[i][0], colorScale*rainbow[i][1], colorScale*rainbow[i][2]];
  }

  num = 15;
  radius = 0.60;
  for (let i = 0; i < num; i++) {
    const x = Math.sin(i / num * Math.PI * 2);
    const z = Math.cos(i / num * Math.PI * 2);
    const m = scene.addMesh(
      `lucy{i}`, 
      lucyMesh,
      mat4.mul<Mat4>(mat4.translation([radius*x, 0, radius*z]), 
        mat4.mul(mat4.rotationY( i * (360/num) * degree), lucyScale)),
      true
    ).getMaterial();
    m.baseColor = [0.9, 0.9, 0.9];
  }

  // num = 25;
  // radius = 0.45;
  // for (let i = 0; i < num; i++) {
  //   const dr = (Math.random() - 0.5) * 0.15;
  //   const x = Math.sin(i / num * Math.PI * 2);
  //   const z = Math.cos(i / num * Math.PI * 2);
  //   const m = scene.addMesh(
  //     `skeleton${i}`, 
  //     skeletonMesh,
  //     mat4.mul<Mat4>(mat4.translation([(radius+dr)*x, 0, (radius+dr)*z]), 
  //       mat4.mul(mat4.rotationY( Math.random() * 360 * degree), skeletonScale)),
  //     true
  //   ).getMaterial();
  //   m.baseColor = [0.9, 0.9, 0.9];
  // }

}