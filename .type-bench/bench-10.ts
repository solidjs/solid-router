import { createRouter, int } from "../src/index.js";
import type { StandardSchemaV1 } from "../src/index.js";

const searchSchema = {} as StandardSchemaV1<{ q?: string; page?: number }>;

const Router = createRouter({
  routes: [
  {
    path: "/section0/:id",
    matchFilters: { id: int },
    search: searchSchema,
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },
  {
    path: "/section1/:id",
    matchFilters: { id: int },
    
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },
  {
    path: "/section2/:id",
    matchFilters: { id: int },
    
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },
  {
    path: "/section3/:id",
    matchFilters: { id: int },
    search: searchSchema,
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },
  {
    path: "/section4/:id",
    matchFilters: { id: int },
    
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },
  {
    path: "/section5/:id",
    matchFilters: { id: int },
    
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },
  {
    path: "/section6/:id",
    matchFilters: { id: int },
    search: searchSchema,
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },
  {
    path: "/section7/:id",
    matchFilters: { id: int },
    
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },
  {
    path: "/section8/:id",
    matchFilters: { id: int },
    
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },
  {
    path: "/section9/:id",
    matchFilters: { id: int },
    search: searchSchema,
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },
  ] as const
});
const { paths } = Router;

paths.section0(0);
paths.section0(0).detail("d0");
paths.section0(0).settings.advanced();
paths.section0(0, { q: "x", page: 0 });
paths.section1(1);
paths.section1(1).detail("d1");
paths.section1(1).settings.advanced();
paths.section2(2);
paths.section2(2).detail("d2");
paths.section2(2).settings.advanced();
paths.section3(3);
paths.section3(3).detail("d3");
paths.section3(3).settings.advanced();
paths.section3(3, { q: "x", page: 3 });
paths.section4(4);
paths.section4(4).detail("d4");
paths.section4(4).settings.advanced();
paths.section5(5);
paths.section5(5).detail("d5");
paths.section5(5).settings.advanced();
paths.section6(6);
paths.section6(6).detail("d6");
paths.section6(6).settings.advanced();
paths.section6(6, { q: "x", page: 6 });
paths.section7(7);
paths.section7(7).detail("d7");
paths.section7(7).settings.advanced();
paths.section8(8);
paths.section8(8).detail("d8");
paths.section8(8).settings.advanced();
paths.section9(9);
paths.section9(9).detail("d9");
paths.section9(9).settings.advanced();
paths.section9(9, { q: "x", page: 9 });

export {};
