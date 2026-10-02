"""Procedural asset factory for STEEL//DIRECTIVE.

Run headless:
    blender -b -P tools/blender/build_assets.py -- --out assets/models [--render docs/renders]

Builds five faction chassis, eight weapons and a set of arena props as GLB files.
Every mech exposes named pivot nodes the game animates at runtime:
    hips, torso, thigh_L/R, shin_L/R, foot_L/R,
    mount_arm_L/R, mount_shoulder_L/R, sensor, exhaust_L/R
Materials are named by role (paint_primary, paint_secondary, trim, metal_dark,
glow, glass) so the engine can recolour a chassis for any team.

Blender is Z-up and the glTF exporter maps Blender -Y to glTF +Z, so every
model is built facing -Y (the game treats +Z as forward).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.abspath(arg("--out", os.path.join(ROOT, "assets", "models")))
RENDER = arg("--render")
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- materials
MATS = {}


def material(name, color, metal=0.6, rough=0.45, emit=None, strength=0.0, alpha=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    MATS[name] = m
    return m


def srgb(hexv):
    c = [((hexv >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def reset_materials(palette):
    """Palette colours are only defaults; the engine repaints by material name."""
    MATS.clear()
    base = {"paint_primary", "paint_secondary", "trim", "metal_dark", "metal_raw", "rubber", "glow", "glass"}
    for m in list(bpy.data.materials):
        if m.name in base:
            bpy.data.materials.remove(m)
    material("paint_primary", srgb(palette[0]), 0.45, 0.42)
    material("paint_secondary", srgb(palette[1]), 0.5, 0.4)
    material("trim", srgb(palette[2]), 0.85, 0.3)
    material("metal_dark", srgb(0x1a1f22), 0.9, 0.35)
    material("metal_raw", srgb(0x7c868a), 1.0, 0.28)
    material("rubber", srgb(0x0e1011), 0.0, 0.85)
    material("glow", srgb(palette[3]), 0.0, 0.3, srgb(palette[3]), 6.0)
    material("glass", srgb(0x0b1316), 0.2, 0.05)


# ---------------------------------------------------------------- geometry helpers
def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.objects, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.3
    bpy.context.collection.objects.link(o)
    o.location = loc
    if parent:
        o.parent = parent
    return o


def _finish(bm, name, mat, loc, rot, parent, bevel, segments=2):
    if bevel > 0:
        edges = [e for e in bm.edges if not e.is_boundary]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(MATS[mat])
    o.location = loc
    o.rotation_euler = Euler(rot)
    if parent:
        o.parent = parent
    return o


def block(name, size, loc=(0, 0, 0), mat="paint_primary", parent=None, rot=(0, 0, 0), taper=(1, 1), shift=(0, 0), bevel=0.06, segments=2):
    """Box with optional tapered/shifted top face — the workhorse armour plate."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
        if v.co.z > 0:
            v.co.x = v.co.x * taper[0] + shift[0]
            v.co.y = v.co.y * taper[1] + shift[1]
    return _finish(bm, name, mat, loc, rot, parent, bevel, segments)


def cylinder(name, r, depth, loc=(0, 0, 0), mat="metal_dark", parent=None, rot=(0, 0, 0), seg=16, r2=None, bevel=0.02):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    return _finish(bm, name, mat, loc, rot, parent, bevel, 1)


def sphere(name, r, loc=(0, 0, 0), mat="metal_dark", parent=None, subdiv=1, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    for v in bm.verts:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
    return _finish(bm, name, mat, loc, (0, 0, 0), parent, 0)


def prism(name, points, depth, loc=(0, 0, 0), mat="paint_primary", parent=None, rot=(0, 0, 0), bevel=0.04):
    """Extrude a 2D outline (in the XZ plane) along Y — for fins, crests and blades."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in points]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in points]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(bm, name, mat, loc, rot, parent, bevel, 1)


# ---------------------------------------------------------------- leg rigs
def leg(side, hip, spec, parent):
    """Builds thigh -> shin -> foot pivots. spec: dict of proportions/style."""
    s = "L" if side < 0 else "R"
    x = spec["hip_width"] * side
    hz = spec["hip_height"]
    thigh = empty(f"thigh_{s}", (x, 0, hz), parent)
    tl, sl = spec["thigh_len"], spec["shin_len"]
    reverse = spec.get("reverse", False)
    # Knee offset: forward (-Y) for standard legs, backward (+Y) for reverse joints.
    knee_y = (0.95 if reverse else -0.35) * spec.get("knee_bias", 1)
    knee = Vector((0, knee_y, -tl))
    tw = spec["thigh_w"]
    # R_x(a) maps (0,0,-L) to (0, L*sin a, -L*cos a), so a = atan2(dy, L).
    ang, tlen = math.atan2(knee.y, tl), knee.length
    mid = (0, knee.y / 2, -tl / 2)
    block(f"thigh_armor_{s}", (tw, tw * 1.1, tlen * 0.92), mid, "paint_primary", thigh, rot=(ang, 0, 0), taper=(1.15, 1.1), bevel=0.07)
    block(f"thigh_plate_{s}", (tw * 0.35, tw * 0.9, tlen * 0.65), (side * tw * 0.55, *mid[1:]), "paint_secondary", thigh, rot=(ang, 0, 0), bevel=0.05)
    cylinder(f"piston_{s}", 0.1, tlen * 0.8, (-side * tw * 0.52, knee.y / 2 + 0.18, -tl / 2), "metal_raw", thigh, rot=(ang, 0, 0), seg=10)
    cylinder(f"hip_joint_{s}", tw * 0.62, tw * 1.25, (0, 0, 0), "metal_dark", thigh, rot=(0, math.pi / 2, 0), seg=18)
    cylinder(f"hip_cap_{s}", tw * 0.4, tw * 1.4, (0, 0, 0), "trim", thigh, rot=(0, math.pi / 2, 0), seg=12)

    shin = empty(f"shin_{s}", tuple(knee), thigh)
    cylinder(f"knee_joint_{s}", tw * 0.5, tw * 1.05, (0, 0, 0), "metal_dark", shin, rot=(0, math.pi / 2, 0), seg=16)
    ankle = Vector((0, -knee.y * (1.3 if reverse else 0.35), -sl))
    sang, slen = math.atan2(ankle.y, sl), ankle.length
    sw = spec["shin_w"]
    smid = (0, ankle.y / 2, -sl / 2)
    block(f"shin_armor_{s}", (sw, sw * 1.15, slen * 0.9), smid, "paint_primary", shin, rot=(sang, 0, 0), taper=(1.2, 1.2), bevel=0.07)
    front = -1 if not reverse else 1  # the side of the shin the knee points to
    block(f"knee_guard_{s}", (sw * 0.9, 0.3, slen * 0.4), (0, ankle.y * 0.2 + front * 0.5 * sw, -sl * 0.2), "paint_secondary", shin, rot=(sang - front * 0.2, 0, 0), taper=(0.8, 1), bevel=0.06)
    cylinder(f"shin_piston_{s}", 0.08, slen * 0.7, (side * sw * 0.55, *smid[1:]), "metal_raw", shin, rot=(sang, 0, 0), seg=8)
    block(f"shin_light_{s}", (0.08, 0.05, slen * 0.3), (side * sw * 0.2, ankle.y * 0.55 + front * sw * 0.6, -sl * 0.55), "glow", shin, rot=(sang, 0, 0), bevel=0)

    foot = empty(f"foot_{s}", tuple(ankle), shin)
    cylinder(f"ankle_{s}", sw * 0.34, sw * 0.9, (0, 0, 0), "metal_dark", foot, rot=(0, math.pi / 2, 0), seg=12)
    fz = -spec["foot_drop"]
    fl = spec["foot_len"]
    if spec.get("toes"):
        for i, a in enumerate((-0.45, 0, 0.45)):
            toe = block(f"toe_{s}{i}", (0.28, fl * 0.7, 0.26), (math.sin(a) * fl * 0.3, -math.cos(a) * fl * 0.32, fz), "metal_dark", foot, rot=(0, 0, -a), taper=(0.7, 0.8), bevel=0.05)
        block(f"heel_{s}", (0.3, fl * 0.4, 0.26), (0, fl * 0.3, fz), "metal_dark", foot, taper=(0.7, 0.8))
    else:
        block(f"foot_sole_{s}", (fl * 0.62, fl, 0.3), (0, -fl * 0.18, fz), "metal_dark", foot, taper=(0.9, 0.85), bevel=0.06)
        block(f"foot_top_{s}", (fl * 0.5, fl * 0.55, 0.28), (0, -fl * 0.2, fz + 0.28), "paint_secondary", foot, taper=(0.8, 0.7), bevel=0.06)
    return thigh


# ---------------------------------------------------------------- chassis builders
def base_skeleton(spec):
    spec["hip_height"] = spec["thigh_len"] + spec["shin_len"] + spec["foot_drop"] + 0.15
    root = empty("mech_root")
    hips = empty("hips", (0, 0, 0), root)
    for side in (-1, 1):
        leg(side, hips, spec, hips)
    pelvis = block("pelvis", (spec["hip_width"] * 1.7, spec["thigh_w"] * 1.5, 0.75), (0, 0, spec["hip_height"] + 0.1), "metal_dark", hips, taper=(1.1, 1.05), bevel=0.08)
    torso = empty("torso", (0, 0, spec["hip_height"] + 0.35), root)
    cylinder("waist", 0.62, 0.55, (0, 0, 0.1), "metal_dark", torso, seg=16)
    cylinder("waist_ring", 0.72, 0.16, (0, 0, 0.32), "trim", torso, seg=20)
    return root, hips, torso


def mounts(torso, arm, shoulder, sensor, exhaust):
    for side, s in ((-1, "L"), (1, "R")):
        empty(f"mount_arm_{s}", (arm[0] * side, arm[1], arm[2]), torso)
        empty(f"mount_shoulder_{s}", (shoulder[0] * side, shoulder[1], shoulder[2]), torso)
        empty(f"exhaust_{s}", (exhaust[0] * side, exhaust[1], exhaust[2]), torso)
    empty("sensor", sensor, torso)


def arm_stub(torso, side, x, z, size, style="paint_primary"):
    s = "L" if side < 0 else "R"
    cylinder(f"shoulder_joint_{s}", size * 0.45, size * 0.9, (side * (x - size * 0.4), 0, z), "metal_dark", torso, rot=(0, math.pi / 2, 0), seg=16)
    block(f"upper_arm_{s}", (size * 0.62, size * 0.7, size * 0.9), (side * x, 0, z - size * 0.35), style, torso, taper=(1.1, 1.1), bevel=0.06)


def build_hound():
    """RAM // IRON HOUNDS — heavy brawler, wide shoulders and a ram plate."""
    spec = dict(hip_width=1.25, hip_height=3.7, thigh_len=1.9, shin_len=2.0, thigh_w=0.9, shin_w=0.95, foot_len=1.9, foot_drop=0.2, knee_bias=1.0)
    root, hips, torso = base_skeleton(spec)
    block("core", (3.3, 2.5, 2.1), (0, 0.1, 1.35), "paint_primary", torso, taper=(1.12, 0.92), shift=(0, -0.1), bevel=0.14, segments=3)
    block("chest_plate", (2.6, 0.55, 1.5), (0, -1.3, 1.25), "paint_secondary", torso, rot=(0.22, 0, 0), taper=(0.82, 1), bevel=0.1)
    block("ram_plate", (3.0, 0.4, 0.8), (0, -1.55, 0.35), "trim", torso, rot=(-0.3, 0, 0), taper=(0.9, 1), bevel=0.08)
    for i in range(4):
        block(f"ram_tooth_{i}", (0.28, 0.3, 0.32), (-1.05 + i * 0.7, -1.78, 0.05), "metal_raw", torso, taper=(0.4, 0.4), bevel=0.03)
    block("cockpit_brow", (1.5, 0.7, 0.45), (0, -1.1, 2.35), "metal_dark", torso, taper=(0.8, 0.8), bevel=0.08)
    block("visor", (1.1, 0.12, 0.2), (0, -1.46, 2.2), "glow", torso, bevel=0)
    for side in (-1, 1):
        s = "L" if side < 0 else "R"
        block(f"pauldron_{s}", (1.4, 1.9, 1.1), (side * 2.1, 0, 2.35), "paint_primary", torso, rot=(0, side * 0.22, 0), taper=(0.75, 0.85), bevel=0.14, segments=3)
        block(f"pauldron_trim_{s}", (1.45, 0.3, 0.3), (side * 2.1, -0.95, 2.25), "trim", torso, rot=(0, side * 0.22, 0), bevel=0.05)
        for k in range(3):
            block(f"hazard_{s}{k}", (0.18, 1.2, 0.08), (side * (1.75 + k * 0.28), 0, 2.93 - k * 0.08), "paint_secondary", torso, rot=(0, side * 0.22, 0), bevel=0)
        arm_stub(torso, side, 2.05, 1.35, 1.05)
        cylinder(f"exhaust_pipe_{s}", 0.22, 1.6, (side * 0.85, 1.35, 2.2), "metal_dark", torso, seg=12)
        cylinder(f"exhaust_tip_{s}", 0.16, 0.15, (side * 0.85, 1.35, 3.02), "glow", torso, seg=12)
    block("backpack", (2.2, 1.1, 1.8), (0, 1.35, 1.35), "metal_dark", torso, taper=(0.9, 0.8), bevel=0.1)
    cylinder("reactor", 0.55, 0.3, (0, 1.95, 1.4), "glow", torso, rot=(math.pi / 2, 0, 0), seg=20)
    mounts(torso, arm=(2.75, -0.3, 1.1), shoulder=(1.65, 0.35, 3.05), sensor=(0, -1.5, 2.2), exhaust=(0.85, 1.35, 3.1))
    return root


def build_vector():
    """GHOST // SILENT VECTOR — tall reverse-joint scout with a big sensor head."""
    spec = dict(hip_width=1.0, hip_height=4.0, thigh_len=2.1, shin_len=2.3, thigh_w=0.62, shin_w=0.62, foot_len=1.7, foot_drop=0.15, reverse=True, toes=True, knee_bias=1.1)
    root, hips, torso = base_skeleton(spec)
    block("core", (2.3, 2.3, 1.5), (0, 0.2, 1.15), "paint_primary", torso, taper=(0.8, 0.75), shift=(0, -0.2), bevel=0.18, segments=3)
    block("keel", (0.5, 2.6, 0.7), (0, 0.1, 0.55), "paint_secondary", torso, taper=(0.6, 0.9), bevel=0.1)
    head = block("head", (1.5, 1.6, 0.95), (0, -0.85, 2.15), "paint_primary", torso, taper=(0.82, 0.7), shift=(0, 0.12), bevel=0.16, segments=3)
    block("visor_band", (1.35, 0.12, 0.28), (0, -1.62, 2.1), "glow", torso, taper=(0.9, 1), bevel=0)
    for i, x in enumerate((-0.4, 0, 0.4)):
        sphere(f"lens_{i}", 0.13, (x, -1.72, 2.1), "glass", torso)
    cylinder("dish_mast", 0.06, 1.1, (0.6, 0.2, 2.95), "metal_raw", torso, seg=8)
    cylinder("dish", 0.55, 0.08, (0.6, 0.2, 3.5), "paint_secondary", torso, rot=(0.9, 0, 0.4), seg=24, r2=0.2)
    cylinder("antenna", 0.03, 1.6, (-0.55, 0.6, 3.1), "metal_raw", torso, seg=6)
    sphere("antenna_tip", 0.08, (-0.55, 0.6, 3.92), "glow", torso)
    for side in (-1, 1):
        s = "L" if side < 0 else "R"
        prism(f"fin_{s}", [(0, 0), (1.3, 0.2), (1.6, 0.9), (0.2, 0.5)], 0.14, (side * 1.0, 0.8, 1.6), "paint_secondary", torso, rot=(0, 0, 0 if side > 0 else math.pi), bevel=0.02)
        block(f"cowl_{s}", (0.9, 1.5, 0.8), (side * 1.35, 0.05, 1.7), "paint_primary", torso, rot=(0, side * 0.35, 0), taper=(0.6, 0.8), bevel=0.14)
        arm_stub(torso, side, 1.5, 1.1, 0.8, "paint_secondary")
        block(f"stripe_{s}", (0.05, 1.3, 0.12), (side * 1.18, -0.05, 1.95), "glow", torso, bevel=0)
    mounts(torso, arm=(2.05, -0.25, 0.85), shoulder=(1.2, 0.35, 2.35), sensor=(0, -1.7, 2.1), exhaust=(0.7, 1.1, 1.9))
    return root


def build_castle():
    """CHESS // RED CASTLE — knightly frame with a rook crown and a tabard."""
    spec = dict(hip_width=1.15, hip_height=3.9, thigh_len=2.0, shin_len=2.05, thigh_w=0.78, shin_w=0.85, foot_len=1.8, foot_drop=0.2)
    root, hips, torso = base_skeleton(spec)
    block("core", (2.7, 2.1, 2.0), (0, 0.05, 1.3), "paint_primary", torso, taper=(1.18, 1.0), bevel=0.12, segments=3)
    block("breastplate", (2.2, 0.5, 1.7), (0, -1.1, 1.3), "paint_secondary", torso, rot=(0.12, 0, 0), taper=(0.7, 1), shift=(0, 0.05), bevel=0.12)
    prism("chest_emblem", [(-0.35, 0), (0.35, 0), (0.25, 0.55), (0.35, 0.8), (-0.35, 0.8), (-0.25, 0.55)], 0.1, (0, -1.4, 1.0), "trim", torso, bevel=0.02)
    block("helm", (1.1, 1.2, 0.95), (0, -0.55, 2.55), "paint_primary", torso, taper=(0.85, 0.85), bevel=0.12)
    block("helm_slit", (0.85, 0.1, 0.12), (0, -1.16, 2.55), "glow", torso, bevel=0)
    cylinder("crown_ring", 0.62, 0.35, (0, -0.55, 3.2), "trim", torso, seg=16)
    for i in range(6):
        a = i / 6 * math.tau
        block(f"crenel_{i}", (0.26, 0.26, 0.3), (math.cos(a) * 0.52, -0.55 + math.sin(a) * 0.52, 3.5), "trim", torso, rot=(0, 0, a), bevel=0.03)
    for side in (-1, 1):
        s = "L" if side < 0 else "R"
        block(f"pauldron_{s}", (1.3, 1.6, 0.6), (side * 1.85, 0, 2.3), "paint_secondary", torso, rot=(0, side * 0.45, 0), taper=(0.8, 0.9), bevel=0.14, segments=3)
        block(f"pauldron_edge_{s}", (1.35, 1.65, 0.12), (side * 1.95, 0, 2.05), "trim", torso, rot=(0, side * 0.45, 0), bevel=0.03)
        arm_stub(torso, side, 1.85, 1.3, 0.95)
    block("tabard", (1.9, 0.18, 2.6), (0, 1.25, 0.4), "paint_secondary", torso, rot=(-0.12, 0, 0), taper=(1.2, 1), bevel=0.04)
    block("tabard_trim", (2.0, 0.2, 0.18), (0, 1.13, -0.85), "trim", torso, rot=(-0.12, 0, 0), bevel=0.03)
    block("backpack", (1.8, 1.0, 1.6), (0, 1.05, 1.6), "metal_dark", torso, bevel=0.1)
    for side in (-1, 1):
        cylinder(f"banner_pole_{'L' if side < 0 else 'R'}", 0.05, 2.2, (side * 0.6, 1.35, 2.9), "trim", torso, seg=8)
    mounts(torso, arm=(2.5, -0.25, 1.05), shoulder=(1.4, 0.45, 2.85), sensor=(0, -1.2, 2.55), exhaust=(0.6, 1.4, 2.5))
    return root


def build_spark():
    """VOLT // BLACK SPARK — lean chicken-walker with tesla spine and blades."""
    spec = dict(hip_width=0.95, hip_height=3.6, thigh_len=2.0, shin_len=2.2, thigh_w=0.6, shin_w=0.6, foot_len=1.6, foot_drop=0.15, reverse=True, toes=True, knee_bias=1.35)
    root, hips, torso = base_skeleton(spec)
    block("core", (2.2, 2.6, 1.5), (0, 0.2, 1.1), "paint_primary", torso, rot=(0.12, 0, 0), taper=(0.75, 0.6), shift=(0, -0.35), bevel=0.12, segments=3)
    block("snout", (1.2, 1.5, 0.8), (0, -1.45, 1.35), "paint_primary", torso, rot=(0.22, 0, 0), taper=(0.55, 0.6), shift=(0, -0.1), bevel=0.1)
    block("jaw", (1.0, 1.1, 0.35), (0, -1.55, 0.85), "metal_dark", torso, rot=(-0.12, 0, 0), taper=(0.7, 0.7), bevel=0.06)
    for side in (-1, 1):
        s = "L" if side < 0 else "R"
        block(f"eye_{s}", (0.34, 0.1, 0.12), (side * 0.32, -2.1, 1.45), "glow", torso, rot=(0.22, 0, side * 0.35), bevel=0)
        prism(f"blade_{s}", [(0, 0), (1.8, 0.5), (2.2, 1.3), (0.4, 0.45)], 0.12, (side * 0.9, 0.9, 1.5), "paint_secondary", torso, rot=(0.3, 0, 0 if side > 0 else math.pi), bevel=0.02)
        block(f"flank_{s}", (0.5, 1.9, 0.9), (side * 1.12, 0.1, 1.2), "paint_secondary", torso, rot=(0.1, side * -0.1, 0), taper=(0.7, 0.85), bevel=0.1)
        arm_stub(torso, side, 1.55, 0.9, 0.8)
        block(f"bolt_{s}", (0.06, 1.1, 0.14), (side * 1.4, -0.1, 1.5), "glow", torso, rot=(0.1, 0, side * 0.5), bevel=0)
    for i in range(4):
        z = 1.9 + i * 0.05
        cylinder(f"coil_{i}", 0.34 - i * 0.05, 0.12, (0, 0.55 + i * 0.4, z + i * 0.25), "trim", torso, seg=18)
    cylinder("spine", 0.1, 1.9, (0, 1.2, 2.3), "metal_raw", torso, rot=(-0.8, 0, 0), seg=8)
    sphere("spark_orb", 0.24, (0, 1.95, 2.85), "glow", torso, subdiv=2)
    mounts(torso, arm=(2.05, -0.35, 0.65), shoulder=(1.1, 0.4, 2.0), sensor=(0, -2.1, 1.45), exhaust=(0.55, 1.4, 1.6))
    return root


def build_pathfinder():
    """PLAYER // NULL SIGNAL — balanced frame, the rookie's league-issued chassis."""
    spec = dict(hip_width=1.1, hip_height=3.85, thigh_len=1.95, shin_len=2.05, thigh_w=0.75, shin_w=0.8, foot_len=1.8, foot_drop=0.2)
    root, hips, torso = base_skeleton(spec)
    block("core", (2.7, 2.2, 1.8), (0, 0.1, 1.25), "paint_primary", torso, taper=(1.05, 0.85), shift=(0, -0.08), bevel=0.14, segments=3)
    block("chest", (2.0, 0.55, 1.2), (0, -1.1, 1.35), "paint_secondary", torso, rot=(0.25, 0, 0), taper=(0.75, 1), bevel=0.1)
    block("cockpit", (1.2, 0.9, 0.7), (0, -0.95, 2.2), "metal_dark", torso, taper=(0.75, 0.7), bevel=0.1)
    block("visor", (0.9, 0.1, 0.22), (0, -1.36, 2.15), "glow", torso, bevel=0)
    block("fin", (0.12, 1.3, 0.6), (0, -0.2, 2.75), "paint_secondary", torso, taper=(1, 0.4), shift=(0, 0.35), bevel=0.03)
    for side in (-1, 1):
        s = "L" if side < 0 else "R"
        block(f"shoulder_{s}", (1.15, 1.55, 0.95), (side * 1.85, 0.05, 2.05), "paint_primary", torso, rot=(0, side * 0.3, 0), taper=(0.75, 0.85), bevel=0.14, segments=3)
        block(f"shoulder_stripe_{s}", (0.1, 1.3, 0.06), (side * 1.75, 0.05, 2.52), "glow", torso, rot=(0, side * 0.3, 0), bevel=0)
        arm_stub(torso, side, 1.9, 1.15, 0.95, "paint_secondary")
        cylinder(f"exhaust_pipe_{s}", 0.18, 1.3, (side * 0.72, 1.25, 2.0), "metal_dark", torso, seg=12)
    block("backpack", (1.9, 1.0, 1.6), (0, 1.25, 1.35), "metal_dark", torso, taper=(0.9, 0.85), bevel=0.1)
    cylinder("reactor", 0.45, 0.25, (0, 1.8, 1.35), "glow", torso, rot=(math.pi / 2, 0, 0), seg=20)
    cylinder("antenna", 0.04, 1.3, (0.75, 0.3, 2.8), "metal_raw", torso, seg=6)
    sphere("antenna_tip", 0.08, (0.75, 0.3, 3.46), "glow", torso)
    mounts(torso, arm=(2.55, -0.25, 0.95), shoulder=(1.45, 0.35, 2.75), sensor=(0, -1.4, 2.15), exhaust=(0.72, 1.25, 2.7))
    return root


def build_ring():
    """RING-07 // 2064 — the last piloted league frame: boxy, industrial, with a glass cockpit."""
    spec = dict(hip_width=1.2, hip_height=3.9, thigh_len=1.95, shin_len=2.0, thigh_w=0.85, shin_w=0.9, foot_len=2.0, foot_drop=0.2)
    root, hips, torso = base_skeleton(spec)
    block("core", (3.0, 2.4, 1.9), (0, 0.15, 1.25), "paint_primary", torso, taper=(0.95, 0.9), bevel=0.08)
    block("lower_plate", (2.6, 0.5, 0.9), (0, -1.2, 0.55), "paint_secondary", torso, rot=(-0.2, 0, 0), bevel=0.06)
    # Pilot cockpit: a raised canopy with glass, the thing the Act took away.
    block("cockpit_frame", (1.7, 1.6, 1.2), (0, -0.75, 2.35), "trim", torso, taper=(0.85, 0.8), bevel=0.08)
    block("canopy", (1.3, 0.9, 0.85), (0, -1.25, 2.45), "glass", torso, rot=(0.35, 0, 0), taper=(0.8, 0.7), bevel=0.12, segments=3)
    block("canopy_rib", (0.08, 1.0, 0.9), (0, -1.25, 2.5), "trim", torso, rot=(0.35, 0, 0), bevel=0)
    for side in (-1, 1):
        s = "L" if side < 0 else "R"
        block(f"shoulder_{s}", (1.25, 1.7, 1.0), (side * 1.95, 0.05, 2.0), "paint_primary", torso, bevel=0.06)
        for k in range(3):
            block(f"stripe_{s}{k}", (1.28, 0.22, 0.06), (side * 1.95, -0.55 + k * 0.4, 2.52), "paint_secondary", torso, bevel=0)
        arm_stub(torso, side, 1.95, 1.15, 1.0, "paint_secondary")
        cylinder(f"lamp_{s}", 0.16, 0.12, (side * 0.95, -1.25, 1.75), "glow", torso, rot=(math.pi / 2, 0, 0), seg=12)
        cylinder(f"stack_{s}", 0.22, 1.5, (side * 0.8, 1.25, 2.3), "metal_dark", torso, seg=10)
    block("reactor_housing", (1.9, 1.0, 1.4), (0, 1.35, 1.2), "metal_dark", torso, bevel=0.08)
    cylinder("reactor_core", 0.5, 0.3, (0, 1.9, 1.25), "glow", torso, rot=(math.pi / 2, 0, 0), seg=20)
    block("number_plate", (0.9, 0.06, 0.5), (0, -1.36, 1.3), "trim", torso, bevel=0)
    mounts(torso, arm=(2.6, -0.25, 0.95), shoulder=(1.5, 0.35, 2.6), sensor=(0, -1.6, 2.5), exhaust=(0.8, 1.25, 3.05))
    return root


CHASSIS = {
    # name: (builder, default palette: primary, secondary, trim, glow)
    "hound": (build_hound, (0x1c1c1f, 0xb3161b, 0xd9d9d6, 0xff2a1f)),
    "vector": (build_vector, (0xe8edf2, 0x1b2446, 0x9aa7b8, 0x49a6ff)),
    "castle": (build_castle, (0x2a1a18, 0x8e1420, 0xc9a24a, 0xffc15e)),
    "spark": (build_spark, (0x151219, 0xd4148c, 0x3a3440, 0xff3ad6)),
    "pathfinder": (build_pathfinder, (0x2f4a52, 0x16252a, 0x8aa1a6, 0x3fe0f5)),
    "ring": (build_ring, (0xd8d2c4, 0xd4601a, 0x3a3f44, 0xff9b3a)),
}


# ---------------------------------------------------------------- weapons
def weapon_root(name):
    root = empty(f"weapon_{name}")
    return root


def muzzle(parent, y, z=0.0, x=0.0, name="muzzle"):
    return empty(name, (x, y, z), parent)


def build_weapon(kind):
    r = weapon_root(kind)
    if kind == "autocannon":
        block("housing", (0.75, 1.6, 0.8), (0, 0, 0), "paint_primary", r, taper=(0.9, 0.9), bevel=0.08)
        block("mag", (0.5, 0.7, 0.6), (0, 0.35, -0.55), "metal_dark", r, bevel=0.05)
        cylinder("sleeve", 0.24, 0.8, (0, -1.1, 0.05), "metal_dark", r, rot=(math.pi / 2, 0, 0))
        cylinder("barrel", 0.12, 2.2, (0, -2.4, 0.05), "metal_raw", r, rot=(math.pi / 2, 0, 0))
        cylinder("brake", 0.19, 0.35, (0, -3.45, 0.05), "metal_dark", r, rot=(math.pi / 2, 0, 0), seg=8)
        muzzle(r, -3.7, 0.05)
    elif kind == "rotary":
        block("housing", (0.85, 1.3, 0.85), (0, 0.1, 0), "paint_primary", r, bevel=0.08)
        drum = cylinder("drum", 0.35, 0.4, (0, -0.75, 0), "metal_dark", r, rot=(math.pi / 2, 0, 0))
        for i in range(6):
            a = i / 6 * math.tau
            cylinder(f"barrel_{i}", 0.07, 2.0, (math.cos(a) * 0.22, -1.9, math.sin(a) * 0.22), "metal_raw", r, rot=(math.pi / 2, 0, 0), seg=8)
        cylinder("clamp", 0.33, 0.14, (0, -2.6, 0), "trim", r, rot=(math.pi / 2, 0, 0))
        block("belt_box", (0.55, 0.9, 0.7), (0.5, 0.25, -0.4), "metal_dark", r, bevel=0.05)
        muzzle(r, -2.95)
    elif kind == "railgun":
        block("housing", (0.7, 1.8, 0.75), (0, 0.2, 0), "paint_primary", r, taper=(0.8, 1), bevel=0.08)
        for side in (-1, 1):
            block(f"rail_{side}", (0.14, 3.6, 0.36), (side * 0.22, -2.1, 0), "metal_raw", r, bevel=0.03)
            for i in range(4):
                block(f"coil_{side}_{i}", (0.2, 0.18, 0.5), (side * 0.22, -1.0 - i * 0.75, 0), "glow", r, bevel=0.01)
        block("capacitor", (0.55, 0.9, 0.5), (0, 0.6, 0.55), "metal_dark", r, bevel=0.05)
        muzzle(r, -3.95)
    elif kind == "scatter":
        block("housing", (0.95, 1.5, 0.9), (0, 0, 0), "paint_primary", r, taper=(0.9, 1), bevel=0.1)
        for i, (x, z) in enumerate(((-0.2, 0.15), (0.2, 0.15), (-0.2, -0.2), (0.2, -0.2))):
            cylinder(f"barrel_{i}", 0.15, 1.4, (x, -1.35, z), "metal_dark", r, rot=(math.pi / 2, 0, 0), seg=10)
        block("shroud", (0.95, 0.9, 0.2), (0, -1.2, 0.42), "paint_secondary", r, bevel=0.04)
        muzzle(r, -2.1)
    elif kind == "missile":
        block("pod", (1.2, 1.5, 0.9), (0, 0, 0), "paint_primary", r, taper=(0.95, 0.9), bevel=0.1)
        for ix in range(3):
            for iz in range(2):
                cylinder(f"tube_{ix}{iz}", 0.14, 0.2, (-0.36 + ix * 0.36, -0.72, -0.18 + iz * 0.36), "rubber", r, rot=(math.pi / 2, 0, 0), seg=10)
                sphere(f"warhead_{ix}{iz}", 0.09, (-0.36 + ix * 0.36, -0.72, -0.18 + iz * 0.36), "glow", r)
        block("stripe", (1.22, 0.3, 0.1), (0, 0.2, 0.46), "paint_secondary", r, bevel=0.02)
        muzzle(r, -0.9)
    elif kind == "mortar":
        block("base", (1.1, 1.1, 0.5), (0, 0, -0.1), "paint_primary", r, bevel=0.08)
        cylinder("tube", 0.3, 1.8, (0, -0.35, 0.75), "metal_dark", r, rot=(-0.55, 0, 0), seg=14)
        cylinder("tube_ring", 0.36, 0.2, (0, -0.72, 1.35), "trim", r, rot=(-0.55, 0, 0), seg=14)
        block("sight", (0.25, 0.4, 0.3), (0.55, 0.1, 0.35), "glow", r, bevel=0.02)
        muzzle(r, -0.85, 1.55)
    elif kind == "plasma":
        block("housing", (0.8, 1.6, 0.8), (0, 0, 0), "paint_primary", r, taper=(0.8, 0.9), bevel=0.1)
        cylinder("chamber", 0.32, 0.9, (0, -1.05, 0), "glass", r, rot=(math.pi / 2, 0, 0), seg=16)
        cylinder("core", 0.18, 0.95, (0, -1.05, 0), "glow", r, rot=(math.pi / 2, 0, 0), seg=12)
        for i in range(3):
            cylinder(f"ring_{i}", 0.36, 0.1, (0, -0.7 - i * 0.35, 0), "trim", r, rot=(math.pi / 2, 0, 0), seg=16)
        cylinder("emitter", 0.2, 1.0, (0, -2.0, 0), "metal_dark", r, rot=(math.pi / 2, 0, 0), seg=10, r2=0.12)
        muzzle(r, -2.55)
    elif kind == "arc":
        block("housing", (0.8, 1.2, 0.8), (0, 0.2, 0), "paint_primary", r, bevel=0.08)
        for side in (-1, 1):
            prism(f"prong_{side}", [(0, 0), (0.18, 0), (0.08, 2.0), (-0.05, 1.8)], 0.16, (side * 0.28, -0.3, 0), "metal_raw", r, rot=(-math.pi / 2, 0, 0 if side > 0 else math.pi), bevel=0.02)
        for i in range(3):
            cylinder(f"insulator_{i}", 0.22, 0.12, (0, -0.55 - i * 0.28, 0), "trim", r, rot=(math.pi / 2, 0, 0), seg=12)
        sphere("node", 0.18, (0, -1.6, 0), "glow", r, subdiv=2)
        muzzle(r, -2.2)
    return r


PREVIEW_LOADOUT = {"ring": ("autocannon", "missile"), "hound": ("scatter", "missile"), "vector": ("railgun", "mortar"), "castle": ("autocannon", "missile"), "spark": ("arc", "missile"), "pathfinder": ("autocannon", "missile")}
WEAPONS = ["autocannon", "rotary", "railgun", "scatter", "missile", "mortar", "plasma", "arc"]


# ---------------------------------------------------------------- props
def build_prop(kind):
    r = empty(f"prop_{kind}")
    if kind == "container":  # 1 x 1 x 1 unit footprint, scaled by the engine
        block("shell", (1, 1, 1), (0, 0, 0.5), "paint_primary", r, bevel=0.02)
        for i in range(9):
            block(f"rib_{i}", (1.012, 0.035, 0.94), (0, -0.44 + i * 0.11, 0.5), "paint_primary", r, bevel=0.005)
        block("doorframe", (1.02, 1.02, 0.05), (0, 0, 0.975), "metal_dark", r, bevel=0.005)
        block("band", (1.015, 1.015, 0.06), (0, 0, 0.03), "metal_dark", r, bevel=0.005)
    elif kind == "barrier":
        block("body", (1, 1, 1), (0, 0, 0.5), "paint_primary", r, taper=(1, 0.45), bevel=0.02)
        block("stripe", (1.005, 0.72, 0.08), (0, 0, 0.35), "paint_secondary", r, bevel=0.005)
    elif kind == "silo":
        cylinder("tank", 0.5, 1.0, (0, 0, 0.5), "paint_primary", r, seg=28, bevel=0.01)
        cylinder("cap", 0.46, 0.08, (0, 0, 1.03), "metal_dark", r, seg=28, r2=0.3)
        for i in range(4):
            cylinder(f"ring_{i}", 0.505, 0.02, (0, 0, 0.15 + i * 0.25), "metal_dark", r, seg=28, bevel=0)
        block("ladder", (0.06, 0.03, 1.0), (0, -0.51, 0.5), "trim", r, bevel=0)
    elif kind == "rook":
        cylinder("base", 0.5, 0.18, (0, 0, 0.09), "trim", r, seg=24)
        cylinder("body", 0.38, 0.72, (0, 0, 0.53), "paint_primary", r, seg=24, r2=0.34)
        cylinder("neck", 0.44, 0.08, (0, 0, 0.92), "trim", r, seg=24)
        for i in range(6):
            a = i / 6 * math.tau
            block(f"crenel_{i}", (0.18, 0.14, 0.14), (math.cos(a) * 0.36, math.sin(a) * 0.36, 1.02), "paint_primary", r, rot=(0, 0, a), bevel=0.01)
    elif kind == "pylon":
        block("base", (1, 1, 0.12), (0, 0, 0.06), "metal_dark", r, bevel=0.01)
        block("mast", (0.35, 0.35, 1), (0, 0, 0.5), "paint_primary", r, taper=(0.5, 0.5), bevel=0.01)
        block("band", (0.3, 0.3, 0.03), (0, 0, 0.8), "glow", r, bevel=0)
        sphere("beacon", 0.08, (0, 0, 1.02), "glow", r)
    elif kind == "crate":
        block("box", (1, 1, 1), (0, 0, 0.5), "paint_primary", r, bevel=0.03)
        for side in (-1, 1):
            block(f"brace_{side}", (1.02, 0.08, 1.02), (0, side * 0.35, 0.5), "paint_secondary", r, bevel=0.01)
    elif kind == "wall":
        block("slab", (1, 1, 1), (0, 0, 0.5), "paint_primary", r, bevel=0.01)
        block("cap", (1.03, 1.03, 0.05), (0, 0, 0.99), "trim", r, bevel=0.005)
        block("stripe", (1.004, 1.004, 0.04), (0, 0, 0.18), "paint_secondary", r, bevel=0)
    elif kind == "rock":
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.5)
        import random
        random.seed(7)
        for v in bm.verts:
            v.co *= 0.8 + random.random() * 0.35
            v.co.z = max(v.co.z, -0.1)
        _finish(bm, "rock", "paint_primary", (0, 0, 0.4), (0, 0, 0), r, 0)
    return r


PROPS = ["container", "barrier", "silo", "rook", "pylon", "crate", "wall", "rock"]


# ---------------------------------------------------------------- export & render
def select_tree(root):
    bpy.ops.object.select_all(action="DESELECT")
    stack = [root]
    while stack:
        o = stack.pop()
        o.select_set(True)
        stack.extend(o.children)


def export(root, path):
    select_tree(root)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_extras=False, export_cameras=False, export_lights=False)
    print("exported", os.path.relpath(path, ROOT))


def render_preview(root, path, palette_glow):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 1200, 1200
    scene.render.film_transparent = True
    scene.eevee.use_raytracing = True
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.025, 0.03, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.collection.objects.link(cam)
    cam.location = (-9.5, -11.5, 6.8)
    cam.data.lens = 52
    target = empty("cam_target", (0, 0, 3.6))
    con = cam.constraints.new("TRACK_TO")
    con.target = target
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    scene.camera = cam
    for name, loc, energy, color in (("key", (-6, -8, 10), 2200, (1, 0.92, 0.82)), ("rim", (7, 6, 7), 2600, srgb(palette_glow)), ("fill", (8, -6, 2), 500, (0.6, 0.75, 1))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
        light.data.energy = energy
        light.data.size = 6
        light.data.color = color
        light.location = loc
        bpy.context.collection.objects.link(light)
        c = light.constraints.new("TRACK_TO")
        c.target = target
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def descendants(root):
    out, stack = [], [root]
    while stack:
        o = stack.pop()
        out.append(o)
        stack.extend(o.children)
    return out


def render_lineup(path):
    """All five chassis side by side with their trainers' weapons, for the README."""
    clear_scene()
    order = ["hound", "vector", "pathfinder", "castle", "spark"]
    for i, name in enumerate(order):
        builder, palette = CHASSIS[name]
        reset_materials(palette)
        root = builder()
        arm, shoulder = PREVIEW_LOADOUT[name]
        nodes = {o.name.split(".")[0]: o for o in descendants(root)}
        for mount_name, kind in (("mount_arm_L", arm), ("mount_arm_R", arm), ("mount_shoulder_R", shoulder)):
            w = build_weapon(kind)
            w.parent = nodes[mount_name]
        # Freeze this mech's materials so the next palette does not overwrite them.
        for o in descendants(root):
            if o.type == "MESH":
                o.data.materials[0] = o.data.materials[0].copy()
        x = (i - 2) * 7.4
        root.location = (x, abs(i - 2) * 2.2, 0)
        root.rotation_euler = (0, 0, -0.55 - (i - 2) * 0.12)
    reset_materials((0x0b0f11, 0x0b0f11, 0x0b0f11, 0x3fe0f5))
    floor = block("floor", (60, 30, 0.2), (0, 6, -0.1), "metal_dark", bevel=0)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 2400, 1000
    scene.eevee.use_raytracing = True
    scene.eevee.use_shadows = True
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.018, 0.022, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.collection.objects.link(cam)
    cam.location = (0, -40, 8.5)
    cam.data.lens = 40
    target = empty("cam_target", (0, 2, 4.4))
    con = cam.constraints.new("TRACK_TO")
    con.target, con.track_axis, con.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    scene.camera = cam
    for name, loc, energy, color, size in (("key", (-10, -14, 16), 9000, (1, .93, .85), 10), ("rim_l", (-16, 12, 8), 7000, srgb(0x3fe0f5), 8),
                                           ("rim_r", (16, 12, 8), 7000, srgb(0xff3a2a), 8), ("fill", (0, -20, 2), 1200, (.6, .7, 1), 12)):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
        light.data.energy, light.data.size, light.data.color = energy, size, color
        light.location = loc
        bpy.context.collection.objects.link(light)
        c = light.constraints.new("TRACK_TO")
        c.target = target
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def main():
    if arg("--lineup"):
        render_lineup(os.path.abspath(arg("--lineup")))
        return
    only = arg("--only")
    for name, (builder, palette) in CHASSIS.items():
        if only and only != name:
            continue
        clear_scene()
        reset_materials(palette)
        root = builder()
        export(root, os.path.join(OUT, f"mech_{name}.glb"))
        if RENDER:
            arm, shoulder = PREVIEW_LOADOUT[name]
            for mount_name, kind in (("mount_arm_L", arm), ("mount_arm_R", arm), ("mount_shoulder_R", shoulder)):
                w = build_weapon(kind)
                w.parent = bpy.data.objects[mount_name]
            os.makedirs(RENDER, exist_ok=True)
            render_preview(root, os.path.abspath(os.path.join(RENDER, f"mech_{name}.png")), palette[3])
    if only:
        return
    for kind in WEAPONS:
        clear_scene()
        reset_materials((0x2b3134, 0x9c5a1e, 0x8f9aa0, 0x5fe8ff))
        export(build_weapon(kind), os.path.join(OUT, f"weapon_{kind}.glb"))
    for kind in PROPS:
        clear_scene()
        reset_materials((0x4a555a, 0xc9822e, 0x2a3236, 0xffc36a))
        export(build_prop(kind), os.path.join(OUT, f"prop_{kind}.glb"))


main()
