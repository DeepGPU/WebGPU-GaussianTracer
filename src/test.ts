


// async function foo() {
//   return 1;
// } 

// async function bar() {
//   const x = (await foo());
//   return x;
// }

// function bar2() {
//   let y: number;
//   y = foo().then(x => x);
//   return y;
// }

// function baz() {
//   const x = bar();
//   console.log('qwe');
//   console.log(x);
//   console.log('asd');
//   return x;
// }

// const x = baz();

// const x = 1;
// let y = ()=>1;

// const xx = {
//   x,
//   y,
//   z: ()=>2,
//   w: function() { return 3; }
// };

// xx.x = 'qwe';
// xx.y = 1;
// xx.z = 2;
// xx.w = 3;

// console.log(x);

// function foo(x: number, y: number, z: number) {  
//   let zz = () => z;
//   return {x, y, zz};
// }

// const xxx = foo(1,2,3);
// xxx.x = 10;
// xxx.y = 20;
// // xxx.zz = 30;