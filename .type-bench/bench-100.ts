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
  {
    path: "/section10/:id",
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
    path: "/section11/:id",
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
    path: "/section12/:id",
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
    path: "/section13/:id",
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
    path: "/section14/:id",
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
    path: "/section15/:id",
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
    path: "/section16/:id",
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
    path: "/section17/:id",
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
    path: "/section18/:id",
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
    path: "/section19/:id",
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
    path: "/section20/:id",
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
    path: "/section21/:id",
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
    path: "/section22/:id",
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
    path: "/section23/:id",
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
    path: "/section24/:id",
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
    path: "/section25/:id",
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
    path: "/section26/:id",
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
    path: "/section27/:id",
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
    path: "/section28/:id",
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
    path: "/section29/:id",
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
    path: "/section30/:id",
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
    path: "/section31/:id",
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
    path: "/section32/:id",
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
    path: "/section33/:id",
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
    path: "/section34/:id",
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
    path: "/section35/:id",
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
    path: "/section36/:id",
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
    path: "/section37/:id",
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
    path: "/section38/:id",
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
    path: "/section39/:id",
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
    path: "/section40/:id",
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
    path: "/section41/:id",
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
    path: "/section42/:id",
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
    path: "/section43/:id",
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
    path: "/section44/:id",
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
    path: "/section45/:id",
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
    path: "/section46/:id",
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
    path: "/section47/:id",
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
    path: "/section48/:id",
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
    path: "/section49/:id",
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
    path: "/section50/:id",
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
    path: "/section51/:id",
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
    path: "/section52/:id",
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
    path: "/section53/:id",
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
    path: "/section54/:id",
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
    path: "/section55/:id",
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
    path: "/section56/:id",
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
    path: "/section57/:id",
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
    path: "/section58/:id",
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
    path: "/section59/:id",
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
    path: "/section60/:id",
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
    path: "/section61/:id",
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
    path: "/section62/:id",
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
    path: "/section63/:id",
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
    path: "/section64/:id",
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
    path: "/section65/:id",
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
    path: "/section66/:id",
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
    path: "/section67/:id",
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
    path: "/section68/:id",
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
    path: "/section69/:id",
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
    path: "/section70/:id",
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
    path: "/section71/:id",
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
    path: "/section72/:id",
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
    path: "/section73/:id",
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
    path: "/section74/:id",
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
    path: "/section75/:id",
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
    path: "/section76/:id",
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
    path: "/section77/:id",
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
    path: "/section78/:id",
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
    path: "/section79/:id",
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
    path: "/section80/:id",
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
    path: "/section81/:id",
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
    path: "/section82/:id",
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
    path: "/section83/:id",
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
    path: "/section84/:id",
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
    path: "/section85/:id",
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
    path: "/section86/:id",
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
    path: "/section87/:id",
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
    path: "/section88/:id",
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
    path: "/section89/:id",
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
    path: "/section90/:id",
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
    path: "/section91/:id",
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
    path: "/section92/:id",
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
    path: "/section93/:id",
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
    path: "/section94/:id",
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
    path: "/section95/:id",
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
    path: "/section96/:id",
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
    path: "/section97/:id",
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
    path: "/section98/:id",
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
    path: "/section99/:id",
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
paths.section10(10);
paths.section10(10).detail("d10");
paths.section10(10).settings.advanced();
paths.section11(11);
paths.section11(11).detail("d11");
paths.section11(11).settings.advanced();
paths.section12(12);
paths.section12(12).detail("d12");
paths.section12(12).settings.advanced();
paths.section12(12, { q: "x", page: 12 });
paths.section13(13);
paths.section13(13).detail("d13");
paths.section13(13).settings.advanced();
paths.section14(14);
paths.section14(14).detail("d14");
paths.section14(14).settings.advanced();
paths.section15(15);
paths.section15(15).detail("d15");
paths.section15(15).settings.advanced();
paths.section15(15, { q: "x", page: 15 });
paths.section16(16);
paths.section16(16).detail("d16");
paths.section16(16).settings.advanced();
paths.section17(17);
paths.section17(17).detail("d17");
paths.section17(17).settings.advanced();
paths.section18(18);
paths.section18(18).detail("d18");
paths.section18(18).settings.advanced();
paths.section18(18, { q: "x", page: 18 });
paths.section19(19);
paths.section19(19).detail("d19");
paths.section19(19).settings.advanced();
paths.section20(20);
paths.section20(20).detail("d20");
paths.section20(20).settings.advanced();
paths.section21(21);
paths.section21(21).detail("d21");
paths.section21(21).settings.advanced();
paths.section21(21, { q: "x", page: 21 });
paths.section22(22);
paths.section22(22).detail("d22");
paths.section22(22).settings.advanced();
paths.section23(23);
paths.section23(23).detail("d23");
paths.section23(23).settings.advanced();
paths.section24(24);
paths.section24(24).detail("d24");
paths.section24(24).settings.advanced();
paths.section24(24, { q: "x", page: 24 });
paths.section25(25);
paths.section25(25).detail("d25");
paths.section25(25).settings.advanced();
paths.section26(26);
paths.section26(26).detail("d26");
paths.section26(26).settings.advanced();
paths.section27(27);
paths.section27(27).detail("d27");
paths.section27(27).settings.advanced();
paths.section27(27, { q: "x", page: 27 });
paths.section28(28);
paths.section28(28).detail("d28");
paths.section28(28).settings.advanced();
paths.section29(29);
paths.section29(29).detail("d29");
paths.section29(29).settings.advanced();
paths.section30(30);
paths.section30(30).detail("d30");
paths.section30(30).settings.advanced();
paths.section30(30, { q: "x", page: 30 });
paths.section31(31);
paths.section31(31).detail("d31");
paths.section31(31).settings.advanced();
paths.section32(32);
paths.section32(32).detail("d32");
paths.section32(32).settings.advanced();
paths.section33(33);
paths.section33(33).detail("d33");
paths.section33(33).settings.advanced();
paths.section33(33, { q: "x", page: 33 });
paths.section34(34);
paths.section34(34).detail("d34");
paths.section34(34).settings.advanced();
paths.section35(35);
paths.section35(35).detail("d35");
paths.section35(35).settings.advanced();
paths.section36(36);
paths.section36(36).detail("d36");
paths.section36(36).settings.advanced();
paths.section36(36, { q: "x", page: 36 });
paths.section37(37);
paths.section37(37).detail("d37");
paths.section37(37).settings.advanced();
paths.section38(38);
paths.section38(38).detail("d38");
paths.section38(38).settings.advanced();
paths.section39(39);
paths.section39(39).detail("d39");
paths.section39(39).settings.advanced();
paths.section39(39, { q: "x", page: 39 });
paths.section40(40);
paths.section40(40).detail("d40");
paths.section40(40).settings.advanced();
paths.section41(41);
paths.section41(41).detail("d41");
paths.section41(41).settings.advanced();
paths.section42(42);
paths.section42(42).detail("d42");
paths.section42(42).settings.advanced();
paths.section42(42, { q: "x", page: 42 });
paths.section43(43);
paths.section43(43).detail("d43");
paths.section43(43).settings.advanced();
paths.section44(44);
paths.section44(44).detail("d44");
paths.section44(44).settings.advanced();
paths.section45(45);
paths.section45(45).detail("d45");
paths.section45(45).settings.advanced();
paths.section45(45, { q: "x", page: 45 });
paths.section46(46);
paths.section46(46).detail("d46");
paths.section46(46).settings.advanced();
paths.section47(47);
paths.section47(47).detail("d47");
paths.section47(47).settings.advanced();
paths.section48(48);
paths.section48(48).detail("d48");
paths.section48(48).settings.advanced();
paths.section48(48, { q: "x", page: 48 });
paths.section49(49);
paths.section49(49).detail("d49");
paths.section49(49).settings.advanced();
paths.section50(50);
paths.section50(50).detail("d50");
paths.section50(50).settings.advanced();
paths.section51(51);
paths.section51(51).detail("d51");
paths.section51(51).settings.advanced();
paths.section51(51, { q: "x", page: 51 });
paths.section52(52);
paths.section52(52).detail("d52");
paths.section52(52).settings.advanced();
paths.section53(53);
paths.section53(53).detail("d53");
paths.section53(53).settings.advanced();
paths.section54(54);
paths.section54(54).detail("d54");
paths.section54(54).settings.advanced();
paths.section54(54, { q: "x", page: 54 });
paths.section55(55);
paths.section55(55).detail("d55");
paths.section55(55).settings.advanced();
paths.section56(56);
paths.section56(56).detail("d56");
paths.section56(56).settings.advanced();
paths.section57(57);
paths.section57(57).detail("d57");
paths.section57(57).settings.advanced();
paths.section57(57, { q: "x", page: 57 });
paths.section58(58);
paths.section58(58).detail("d58");
paths.section58(58).settings.advanced();
paths.section59(59);
paths.section59(59).detail("d59");
paths.section59(59).settings.advanced();
paths.section60(60);
paths.section60(60).detail("d60");
paths.section60(60).settings.advanced();
paths.section60(60, { q: "x", page: 60 });
paths.section61(61);
paths.section61(61).detail("d61");
paths.section61(61).settings.advanced();
paths.section62(62);
paths.section62(62).detail("d62");
paths.section62(62).settings.advanced();
paths.section63(63);
paths.section63(63).detail("d63");
paths.section63(63).settings.advanced();
paths.section63(63, { q: "x", page: 63 });
paths.section64(64);
paths.section64(64).detail("d64");
paths.section64(64).settings.advanced();
paths.section65(65);
paths.section65(65).detail("d65");
paths.section65(65).settings.advanced();
paths.section66(66);
paths.section66(66).detail("d66");
paths.section66(66).settings.advanced();
paths.section66(66, { q: "x", page: 66 });
paths.section67(67);
paths.section67(67).detail("d67");
paths.section67(67).settings.advanced();
paths.section68(68);
paths.section68(68).detail("d68");
paths.section68(68).settings.advanced();
paths.section69(69);
paths.section69(69).detail("d69");
paths.section69(69).settings.advanced();
paths.section69(69, { q: "x", page: 69 });
paths.section70(70);
paths.section70(70).detail("d70");
paths.section70(70).settings.advanced();
paths.section71(71);
paths.section71(71).detail("d71");
paths.section71(71).settings.advanced();
paths.section72(72);
paths.section72(72).detail("d72");
paths.section72(72).settings.advanced();
paths.section72(72, { q: "x", page: 72 });
paths.section73(73);
paths.section73(73).detail("d73");
paths.section73(73).settings.advanced();
paths.section74(74);
paths.section74(74).detail("d74");
paths.section74(74).settings.advanced();
paths.section75(75);
paths.section75(75).detail("d75");
paths.section75(75).settings.advanced();
paths.section75(75, { q: "x", page: 75 });
paths.section76(76);
paths.section76(76).detail("d76");
paths.section76(76).settings.advanced();
paths.section77(77);
paths.section77(77).detail("d77");
paths.section77(77).settings.advanced();
paths.section78(78);
paths.section78(78).detail("d78");
paths.section78(78).settings.advanced();
paths.section78(78, { q: "x", page: 78 });
paths.section79(79);
paths.section79(79).detail("d79");
paths.section79(79).settings.advanced();
paths.section80(80);
paths.section80(80).detail("d80");
paths.section80(80).settings.advanced();
paths.section81(81);
paths.section81(81).detail("d81");
paths.section81(81).settings.advanced();
paths.section81(81, { q: "x", page: 81 });
paths.section82(82);
paths.section82(82).detail("d82");
paths.section82(82).settings.advanced();
paths.section83(83);
paths.section83(83).detail("d83");
paths.section83(83).settings.advanced();
paths.section84(84);
paths.section84(84).detail("d84");
paths.section84(84).settings.advanced();
paths.section84(84, { q: "x", page: 84 });
paths.section85(85);
paths.section85(85).detail("d85");
paths.section85(85).settings.advanced();
paths.section86(86);
paths.section86(86).detail("d86");
paths.section86(86).settings.advanced();
paths.section87(87);
paths.section87(87).detail("d87");
paths.section87(87).settings.advanced();
paths.section87(87, { q: "x", page: 87 });
paths.section88(88);
paths.section88(88).detail("d88");
paths.section88(88).settings.advanced();
paths.section89(89);
paths.section89(89).detail("d89");
paths.section89(89).settings.advanced();
paths.section90(90);
paths.section90(90).detail("d90");
paths.section90(90).settings.advanced();
paths.section90(90, { q: "x", page: 90 });
paths.section91(91);
paths.section91(91).detail("d91");
paths.section91(91).settings.advanced();
paths.section92(92);
paths.section92(92).detail("d92");
paths.section92(92).settings.advanced();
paths.section93(93);
paths.section93(93).detail("d93");
paths.section93(93).settings.advanced();
paths.section93(93, { q: "x", page: 93 });
paths.section94(94);
paths.section94(94).detail("d94");
paths.section94(94).settings.advanced();
paths.section95(95);
paths.section95(95).detail("d95");
paths.section95(95).settings.advanced();
paths.section96(96);
paths.section96(96).detail("d96");
paths.section96(96).settings.advanced();
paths.section96(96, { q: "x", page: 96 });
paths.section97(97);
paths.section97(97).detail("d97");
paths.section97(97).settings.advanced();
paths.section98(98);
paths.section98(98).detail("d98");
paths.section98(98).settings.advanced();
paths.section99(99);
paths.section99(99).detail("d99");
paths.section99(99).settings.advanced();
paths.section99(99, { q: "x", page: 99 });

export {};
