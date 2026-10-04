// Official CLI package overlays use selection order, while file overlays use
// phase order. Select declared official prerequisites before custom add-ons so
// the custom add-on's explicit dependency constraints remain authoritative.
export function officialPrerequisitesFirst(
 ordered:readonly {addOnId:string;dependsOn:readonly string[]}[],
 customIds:ReadonlySet<string>,
){return [...new Set(ordered.flatMap(addOn=>addOn.dependsOn).filter(id=>!customIds.has(id)))];}
