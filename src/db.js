import Dexie from "dexie";
export const db = new Dexie("KhoDoAIDatabase");
db.version(1).stores({
  items:
    "++id,name,category,location,createdAt,updatedAt,favorite,imageFingerprint,embeddingModel,embeddingVersion",
});
db.version(2).stores({
  items:
    "++id,name,category,location,createdAt,updatedAt,favorite,imageFingerprint,embeddingModel,embeddingVersion",
  categories: "++id,&name,createdAt",
});
export const itemCount = () => db.items.count();
export async function stats() {
  const items = await db.items.toArray();
  return {
    count: items.length,
    favorites: items.filter((x) => x.favorite).length,
    bytes: items.reduce(
      (n, x) =>
        n +
        (x.imageSize || 0) +
        (x.thumbnailBlob?.size || 0) +
        (x.embedding?.byteLength || 0),
      0,
    ),
  };
}
export function searchable(item) {
  return [
    item.name,
    item.description,
    item.location,
    item.category,
    (item.tags || []).join(" "),
  ]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}
