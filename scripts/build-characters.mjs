#!/usr/bin/env node
/**
 * Builds the 3D view's characters (public/3d/characters/<key>.glb) from the files Meshy produced.
 *
 *   node scripts/build-characters.mjs <folder with <key>-anim.glb and <key>-walk.glb>
 *
 * For each character: copies the free walking clip (a separate armature-only file) into the animated model, by bone
 * name, without its forward root motion (the scene moves walkers along paths itself); gives the clips stable names
 * (see features/hq/characters.ts); shrinks the texture to 1024 px WebP and compresses geometry and animation
 * (EXT_meshopt_compression, decoded in the browser by three-stdlib, no CDN). Source files are not kept in the repo:
 * the Meshy task ids are in docs/crm-v1/VUE-3D.md.
 */
import { readdir } from "node:fs/promises"
import path from "node:path"
import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { dedup, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions"
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer"
import sharp from "sharp"

// Meshy clip name → stable name read by the scene.
const CLIP_NAMES = {
  Chair_Sit_Idle_F: "sit",
  Chair_Sit_Idle_M: "sit",
  Stand_and_Chat: "stand_talk",
  Sitting_Answering_Questions: "sit_talk",
}

const source = process.argv[2]
if (!source) {
  console.error("Usage: node scripts/build-characters.mjs <folder>")
  process.exit(1)
}
const out = path.resolve("public/3d/characters")

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder })

/** Copies `clip` (from another file of the same rig) onto the nodes of `doc` that have the same names. */
function copyClip(doc, clip, name) {
  const nodes = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]))
  const buffer = doc.getRoot().listBuffers()[0]
  const anim = doc.createAnimation(name)
  let skipped = 0
  for (const channel of clip.listChannels()) {
    const target = nodes.get(channel.getTargetNode()?.getName())
    const sampler = channel.getSampler()
    if (!target || !sampler) {
      skipped++
      continue
    }
    const input = doc.createAccessor().setType("SCALAR").setArray(sampler.getInput().getArray().slice()).setBuffer(buffer)
    const values = sampler.getOutput().getArray().slice()
    // Walk in place: the hips keep their height bob but not the forward travel.
    if (channel.getTargetPath() === "translation" && target.getName() === "Hips") {
      const [x0, , z0] = values
      for (let i = 0; i < values.length; i += 3) {
        values[i] = x0
        values[i + 2] = z0
      }
    }
    const output = doc.createAccessor().setType(sampler.getOutput().getType()).setArray(values).setBuffer(buffer)
    const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(sampler.getInterpolation())
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(channel.getTargetPath()).setSampler(s))
  }
  return skipped
}

const files = (await readdir(source)).filter((f) => f.endsWith("-anim.glb"))
for (const file of files) {
  const key = file.replace(/-anim\.glb$/, "")
  const doc = await io.read(path.join(source, file))
  for (const a of doc.getRoot().listAnimations()) a.setName(CLIP_NAMES[a.getName()] ?? a.getName())

  const walk = await io.read(path.join(source, `${key}-walk.glb`))
  const skipped = copyClip(doc, walk.getRoot().listAnimations()[0], "walk")

  await doc.transform(
    dedup(),
    resample(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" })
  )
  const target = path.join(out, `${key}.glb`)
  await io.write(target, doc)
  const clips = doc.getRoot().listAnimations().map((a) => a.getName())
  const bytes = (await io.writeBinary(doc)).byteLength
  process.stdout.write(`${key}: ${(bytes / 1024).toFixed(0)} KB, clips ${clips.join(", ")}${skipped ? `, ${skipped} walk channels without a matching bone` : ""}\n`)
}
