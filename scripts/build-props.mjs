#!/usr/bin/env node
/**
 * Builds the 3D view's props (public/3d/props/<name>.glb) from the files Meshy produced, and their measures
 * (components/crm/hq/scene/props.json) so the scene can size them in metres without guessing.
 *
 *   node scripts/build-props.mjs <folder with <name>.glb>
 *
 * Each model is centred on its footprint with its base at y = 0, its texture shrunk to 1024 px WebP, its geometry
 * compressed (EXT_meshopt_compression, decoded in the browser by three-stdlib, no CDN). For a chair, the height of the
 * seat is measured (the highest point of the middle of the footprint below the backrest), so a seated person's hips
 * can be put on it. The Meshy task ids are in docs/crm-v1/VUE-3D.md.
 */
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { dedup, getBounds, meshopt, prune, textureCompress } from "@gltf-transform/functions"
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer"
import sharp from "sharp"

const source = process.argv[2]
if (!source) {
  console.error("Usage: node scripts/build-props.mjs <folder>")
  process.exit(1)
}
const out = path.resolve("public/3d/props")
const manifestPath = path.resolve("components/crm/hq/scene/props.json")

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder })

/** World-space vertex positions of every primitive (node transforms applied), for measuring. */
function positions(doc) {
  const pts = []
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    for (const prim of mesh.listPrimitives()) {
      const acc = prim.getAttribute("POSITION")
      const v = [0, 0, 0]
      for (let i = 0; i < acc.getCount(); i++) {
        acc.getElement(i, v)
        pts.push([m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]])
      }
    }
  }
  return pts
}

/** Seat height of a chair: top of the middle of the footprint, ignoring the backrest above it. */
function seatHeight(pts, box) {
  const [cx, , cz] = box.min.map((v, i) => (v + box.max[i]) / 2)
  const w = box.max[0] - box.min[0]
  const d = box.max[2] - box.min[2]
  const h = box.max[1] - box.min[1]
  const middle = pts.filter((p) => Math.abs(p[0] - cx) < w * 0.12 && Math.abs(p[2] - cz) < d * 0.12 && p[1] < box.min[1] + h * 0.7)
  return middle.length ? Math.max(...middle.map((p) => p[1])) - box.min[1] : h * 0.5
}

let manifest = {}
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"))
} catch {
  // First run.
}

for (const file of (await readdir(source)).filter((f) => f.endsWith(".glb"))) {
  const name = file.replace(/\.glb$/, "")
  const doc = await io.read(path.join(source, file))
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  const box = getBounds(scene)
  const size = box.max.map((v, i) => v - box.min[i])

  // One parent node puts the footprint centre at the origin and the base on the floor.
  const root = doc.createNode(`${name}-root`).setTranslation([-(box.min[0] + box.max[0]) / 2, -box.min[1], -(box.min[2] + box.max[2]) / 2])
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    root.addChild(child)
  }
  scene.addChild(root)

  const measures = { size: size.map((v) => Number(v.toFixed(4))) }
  if (name === "chair") measures.seat = Number(seatHeight(positions(doc), getBounds(scene)).toFixed(4))

  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" })
  )
  await io.write(path.join(out, `${name}.glb`), doc)
  const triangles = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0)
  const bytes = (await io.writeBinary(doc)).byteLength
  manifest[name] = { ...measures, triangles, meshes: doc.getRoot().listMeshes().length }
  process.stdout.write(`${name}: ${(bytes / 1024).toFixed(0)} KB, ${triangles} triangles, size ${measures.size.join(" × ")}${measures.seat ? `, seat ${measures.seat}` : ""}\n`)
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
