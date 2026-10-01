import {describe,expect,it} from "vitest";
import {officialPrerequisitesFirst} from "./add-on-order";
describe("official CLI prerequisite selection",()=>{
 it("keeps declared order, deduplicates and excludes catalog custom IDs",()=>{
  expect(officialPrerequisitesFirst([{addOnId:"parent",dependsOn:["drizzle"]},{addOnId:"child",dependsOn:["parent","better-auth","drizzle"]}],new Set(["parent","child"]))).toEqual(["drizzle","better-auth"]);
 });
 it("does not infer undeclared capabilities or optional integrations",()=>{
  expect(officialPrerequisitesFirst([{addOnId:"empty",dependsOn:[]}],new Set(["empty"]))).toEqual([]);
 });
});
