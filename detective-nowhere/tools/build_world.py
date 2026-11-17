"""Generates content/world.json for Ryzen-5 from coordinates measured on the source atlas
(public/world/ryzen5_atlas.jpg, 1536x1024 px). All positions are atlas pixel coordinates;
src/world/planet.ts converts them to latitude/longitude on the sphere.
Run:  python3 tools/build_world.py
"""
import json

CONFIRMED, CANDIDATE, AVAILABLE = 'confirmed', 'candidate', 'available'

nodes = []
def node(id, name, kind, x, y, **kw):
    nodes.append(dict(id=id, name=name, kind=kind, px=[x, y], **kw))

# ── Major cities (atlas "Major Cities" panel) ─────────────────────────────
node('zixel', 'Zixel', 'city', 717, 470, map_no=1, type='Megacity (Capital)', pop=3_300_000, area_km2=1300,
     gameplay=CONFIRMED, roles=['capital', 'airship_hub', 'road_hub'], notes='Acts I–II. Veyra district, Kaelis Row.')
node('kitsah', 'Kitsah', 'city', 787, 358, map_no=2, type='Transit Hub', pop=17_000, area_km2=6,
     gameplay=CONFIRMED, roles=['transit_hub', 'airship_hub', 'road_hub'], notes='Peacekeep office (Sgt. Alaric Dane); gambling side missions. The "2" closest to Zixel (atlas glyph is garbled) — per user, Nov 2026.')
node('soledad', 'Soledad', 'city', 470, 620, map_no=9, type='City', pop=350_000, area_km2=38,
     gameplay=AVAILABLE, roles=['port'], notes='City 9 — not in the atlas panel; the atlas mislabels it "2". Per user, Nov 2026.')
node('port_veyra', 'Port Veyra', 'city', 338, 521, map_no=3, type='Major Coastal City', pop=1_900_000, area_km2=540,
     gameplay=CANDIDATE, roles=['port', 'airship_dock'], notes='Side mission S3-01 (shipping auditor). Only major western city on the atlas — candidate for the Act V western facility city (NOT confirmed).')
node('dunefall', 'Dunefall', 'city', 885, 466, map_no=4, type='Major Desert City', pop=1_450_000, area_km2=470,
     gameplay=AVAILABLE, roles=['road_hub', 'airship_dock'])
node('kessar_bay', 'Kessar Bay', 'city', 1072, 398, map_no=5, type='Major Coastal City', pop=1_300_000, area_km2=410,
     gameplay=CONFIRMED, roles=['port', 'airship_dock'], notes='Act III. Atlas places the city ~120 km inland on the River Kessar; its harbour is modelled at the river mouth.')
node('ardent_harbor', 'Ardent Harbor', 'city', 834, 692, map_no=6, type='Medium Coastal City', pop=850_000, area_km2=240,
     gameplay=AVAILABLE, roles=['port'])
node('ironwood_crossing', 'Ironwood Crossing', 'city', 1010, 590, map_no=7, type='Medium Forest City', pop=650_000, area_km2=180,
     gameplay=AVAILABLE, roles=['road_hub'])
node('wayfarers_rest', "Wayfarer's Rest", 'city', 973, 820, map_no=8, type='Small Transit Hub', pop=15_000, area_km2=5,
     gameplay=CONFIRMED, roles=['transit_hub', 'airship_hub', 'port'], notes='Act IV, Southreach (southern continent). Early Chimera labs.')

# ── Outposts (atlas "Outposts" panel; numbers as printed on the map) ───────
O = [
 ('red_mesa_post', 'Red Mesa Post', 1, None, 4600, 3), ('scorpion_watch', 'Scorpion Watch', 2, None, 2800, 2),
 ('blackrock_station', 'Blackrock Station', 3, (472, 220), 1700, 2), ('dustwall_camp', 'Dustwall Camp', 4, (895, 332), 600, 1),
 ('horizon_point', 'Horizon Point', 5, (400, 318), 4900, 3), ('ember_ridge', 'Ember Ridge', 6, (705, 805), 3200, 3),
 ('iron_junction', 'Iron Junction', 7, (980, 912), 2100, 2), ('coyote_crossing', 'Coyote Crossing', 8, None, 1100, 2),
 ('stonewell', 'Stonewell', 9, (546, 592), 800, 1), ('dry_river_post', 'Dry River Post', 10, (667, 457), 350, 1),
 ('frontier_gate', 'Frontier Gate', 11, (1167, 481), 2900, 2), ('razorback_station', 'Razorback Station', 12, (482, 414), 1600, 2),
 ('sandglass_camp', 'Sandglass Camp', 13, (590, 403), 450, 1), ('titan_watch', 'Titan Watch', 14, (940, 153), 3700, 3),
 ('longtrail_outpost', 'Longtrail Outpost', 15, (691, 673), 2300, 2),
]
for id, name, no, pos, pop, area in O:
    if pos is None:
        continue  # placed by REASSIGN below
    extra = {}
    if id == 'titan_watch': extra = dict(gameplay=CONFIRMED, notes='Commander Joren Pike. Frontier permits & security.')
    elif id == 'blackrock_station': extra = dict(gameplay=AVAILABLE, unresolved='Atlas printed "3" three times; this (western Ashen Reach) marker keeps Blackrock Station — provisional.')
    else: extra = dict(gameplay=AVAILABLE)
    node(id, name, 'outpost', *pos, map_no=no, pop=pop, area_km2=area, **extra)

# Duplicate-numbered markers renumbered (atlas was AI-generated). PROVISIONAL — confirm with the user.
#   The three listed outposts with no marker take three of the duplicates; the fourth becomes outpost 16.
REASSIGN = [
  ('red_mesa_post',   'Red Mesa Post',   1, (618, 330), 4600, 3, 'Printed "12" (duplicate). Mesa/badland country west of the Titanspine.'),
  ('scorpion_watch',  'Scorpion Watch',  2, (734, 172), 2800, 2, 'Printed "3" (duplicate). Watch post on the Ashen Reach below Hive Beta.'),
  ('coyote_crossing', 'Coyote Crossing', 8, (785, 872), 1100, 2, 'Printed "9" (duplicate). Southreach, south-west.'),
  ('outpost_16',      'Outpost 16 (unnamed)', 16, (1097, 805), None, None, 'Printed "3" (duplicate). Southreach east coast. Needs a name, population and size.'),
]
for id, name, no, pos, pop, area, why in REASSIGN:
    kw = dict(pop=pop, area_km2=area) if pop else {}
    node(id, name, 'outpost', *pos, map_no=no, gameplay=AVAILABLE, renumbered=True, unresolved=f'Provisional placement — {why}', **kw)

# ── Hostile hives ─────────────────────────────────────────────────────────
node('hive_alpha', 'Hive Alpha', 'hive', 440, 145, hostile=True, gameplay=AVAILABLE)
node('hive_beta', 'Hive Beta', 'hive', 707, 92, hostile=True, gameplay=AVAILABLE)

# ── Connection points: road junctions, ports, landings, passes ────────────
node('j_titan_south', 'Titan Watch Road Fork', 'junction', 913, 218)
node('lake_zenith_shore', 'Lake Zenith South Shore', 'landing', 990, 298, gameplay=CONFIRMED, notes='Lake Zenith (Fisher Joe). Road access point to the lake.')
node('j_dustwall_east', 'Dustwall Fork', 'junction', 1010, 320)
node('j_meridian_sw', 'Meridian South-West Fork', 'junction', 590, 512)
node('titanspine_pass', 'Titanspine Pass (road end)', 'pass', 710, 366)
node('ironwood_landing', 'Ironwood East Landing', 'port', 1090, 630, notes='Road from Ironwood Crossing ends at the Eastern Frontier Ocean coast.')
node('kessar_mouth', 'Kessar River Mouth (Kessar Bay harbour)', 'port', 1112, 540)
node('ember_landing', 'Ember Ridge Landing', 'port', 687, 787)
node('wayfarers_landing', "Wayfarer's North Landing", 'port', 968, 768)
node('soledad_docks', 'Soledad Docks', 'port', 468, 645)
node('port_veyra_docks', 'Port Veyra Docks', 'port', 322, 530)
node('ardent_docks', 'Ardent Harbor Docks', 'port', 834, 712)

# ── Major roads, traced from the atlas red dotted lines (pixel polylines) ──
R = []
def road(a, b, pts, conf='traced'):
    R.append(dict(id=f'{a}__{b}', a=a, b=b, mode='road', confidence=conf, px=pts))
road('port_veyra', 'razorback_station', [(338,521),(385,500),(430,455),(482,414)])
road('port_veyra', 'soledad', [(338,521),(400,540),(425,580),(470,620)])
road('horizon_point', 'sandglass_camp', [(400,318),(440,345),(470,352),(520,375),(580,390),(590,403)], 'inferred')
road('sandglass_camp', 'dry_river_post', [(590,403),(635,423),(660,440),(667,457)])
road('dry_river_post', 'zixel', [(667,457),(695,465),(717,470)])
road('zixel', 'j_meridian_sw', [(717,470),(680,505),(640,507),(590,512)])
road('j_meridian_sw', 'stonewell', [(590,512),(575,545),(560,572),(546,592)])
road('j_meridian_sw', 'soledad', [(590,512),(600,540),(590,590),(575,640),(520,643),(470,620)], 'inferred')
road('zixel', 'longtrail_outpost', [(717,470),(723,527),(723,607),(707,653),(691,673)])
road('zixel', 'dunefall', [(717,470),(755,505),(800,505),(850,495),(885,466)])
road('zixel', 'kitsah', [(717,470),(745,470),(775,455),(780,402),(787,358)])
road('kitsah', 'titanspine_pass', [(787,358),(767,367),(710,366)])
road('kitsah', 'dunefall', [(787,358),(810,380),(830,420),(850,450),(885,466)])
road('kitsah', 'j_titan_south', [(787,358),(807,330),(827,297),(847,267),(853,240),(877,220),(913,218)])
road('titan_watch', 'j_titan_south', [(940,153),(933,190),(913,218)])
road('j_titan_south', 'lake_zenith_shore', [(913,218),(933,247),(953,273),(990,298)])
road('lake_zenith_shore', 'j_dustwall_east', [(990,298),(1010,313),(1010,320)])
road('j_dustwall_east', 'kessar_bay', [(1010,320),(1013,353),(1030,385),(1072,398)])
road('kitsah', 'dustwall_camp', [(787,358),(810,370),(833,367),(867,373),(892,357),(895,332)])
road('dustwall_camp', 'j_dustwall_east', [(895,332),(920,327),(953,320),(1010,320)])
road('dunefall', 'kessar_bay', [(885,466),(920,480),(1000,480),(1050,450),(1072,398)])
road('dunefall', 'ardent_harbor', [(885,466),(880,510),(865,585),(850,645),(834,692)])
road('dunefall', 'ironwood_crossing', [(885,466),(900,520),(950,570),(1010,590)])
road('ironwood_crossing', 'ironwood_landing', [(1010,590),(1025,620),(1090,630)])
road('kessar_bay', 'frontier_gate', [(1072,398),(1120,420),(1167,481)])
road('kessar_bay', 'kessar_mouth', [(1072,398),(1085,450),(1100,500),(1112,540)], 'inferred')
road('hive_alpha', 'blackrock_station', [(440,145),(455,190),(472,220)])
road('hive_beta', 'scorpion_watch', [(707,92),(712,140),(734,172)])
road('wayfarers_rest', 'iron_junction', [(973,820),(985,850),(1000,880),(980,912)])
road('wayfarers_rest', 'wayfarers_landing', [(973,820),(968,768)], 'inferred')
road('ember_ridge', 'ember_landing', [(705,805),(687,787)])
road('soledad', 'soledad_docks', [(470,620),(468,645)], 'inferred')
road('port_veyra', 'port_veyra_docks', [(338,521),(322,530)], 'inferred')
road('ardent_harbor', 'ardent_docks', [(834,692),(834,712)], 'inferred')

# ── Proposed sea lanes & airship routes (NOT drawn on the atlas) ───────────
def lane(a, b, mode, pts=None):
    R.append(dict(id=f'{mode}:{a}__{b}', a=a, b=b, mode=mode, confidence='proposed', px=pts or []))
lane('port_veyra_docks', 'soledad_docks', 'sea', [(322,530),(300,600),(350,690),(430,690),(468,660)])
lane('soledad_docks', 'ardent_docks', 'sea', [(468,660),(560,720),(700,735),(800,725),(834,712)])
lane('ardent_docks', 'ember_landing', 'sea', [(834,712),(760,745),(687,787)])
lane('ardent_docks', 'wayfarers_landing', 'sea', [(834,712),(900,740),(968,768)])
lane('kessar_mouth', 'ironwood_landing', 'sea', [(1112,540),(1135,580),(1090,630)])
lane('ironwood_landing', 'wayfarers_landing', 'sea', [(1090,630),(1130,700),(1060,745),(968,768)])
for a, b in [('zixel','kitsah'),('zixel','soledad'),('zixel','port_veyra'),('zixel','dunefall'),('zixel','kessar_bay'),('zixel','wayfarers_rest'),
             ('zixel','titan_watch'),('kitsah','wayfarers_rest'),('kitsah','titan_watch'),('kessar_bay','wayfarers_rest')]:
    lane(a, b, 'air')

# ── Trade corridors (groupings of the routes above; goods are suggestions) ──
trade = [
 dict(id='meridian_trunk', name='Meridian Trunk', status='derived from atlas roads',
      path=['port_veyra','soledad','j_meridian_sw','zixel','dunefall','kessar_bay'], suggested_goods=['shipping freight', 'manufactured goods', 'passengers'],
      note='Coast-to-coast spine across the Meridian Expanse.'),
 dict(id='highland_road', name='Highland Road', status='derived from atlas roads',
      path=['titan_watch','j_titan_south','lake_zenith_shore','j_dustwall_east','kessar_bay'], suggested_goods=['frontier permits', 'lake fish', 'fresh water'],
      note='Northern frontier route past Lake Zenith.'),
 dict(id='titanspine_north', name='Titanspine North Road', status='derived from atlas roads',
      path=['zixel','kitsah','j_titan_south','titan_watch'], suggested_goods=['military supply', 'ore']),
 dict(id='western_frontier', name='Western Frontier Road', status='derived from atlas roads',
      path=['port_veyra','razorback_station'], suggested_goods=['salvage'], note='Road also runs Horizon Point–Sandglass–Dry River–Zixel (the Horizon segment is inferred).'),
 dict(id='ironwood_timber', name='Ironwood Road', status='derived from atlas roads',
      path=['dunefall','ironwood_crossing','ironwood_landing'], suggested_goods=['timber', 'forest goods']),
 dict(id='southern_road', name='Ardent Road', status='derived from atlas roads',
      path=['zixel','dunefall','ardent_harbor'], suggested_goods=['desert minerals', 'sea freight']),
 dict(id='equatorial_lane', name='Equatorial Sea Lane', status='proposed',
      path=['port_veyra_docks','soledad_docks','ardent_docks','wayfarers_landing'], suggested_goods=['bulk freight', 'passengers'],
      note='Links the main continent to Southreach. Not drawn on the atlas.'),
 dict(id='transit_air', name='Transit Airship Network', status='proposed',
      path=['zixel','kitsah','wayfarers_rest'], suggested_goods=['passengers', 'mail', 'priority cargo'],
      note='Kitsah and Wayfarer\'s Rest are the atlas "Transit Hubs".'),
]

regions = [
 dict(name='The Ashen Reach', sub='Hive Continent — hostile', px=[555,105]), dict(name='The Shattered Expanse', px=[595,162]),
 dict(name='Emerald Canopy', px=[390,355]), dict(name='The Meridian Expanse', px=[750,563]), dict(name='Ironwood Forest', px=[1082,340], gameplay=CONFIRMED),
 dict(name='Red Fang Peaks', px=[1000,172]), dict(name='Titanspine Mountains', px=[740,420]), dict(name='Razorback Ranges', px=[540,490]),
 dict(name='Southreach', sub='Southern Continent', px=[835,825]), dict(name='Mistwood Basin', px=[1025,820]), dict(name='Stormbreaker Range', px=[860,765]),
]
waters = [
 dict(name='Western Drift Ocean', kind='ocean', px=[265,468]), dict(name='Eastern Frontier Ocean', kind='ocean', px=[1240,540]),
 dict(name='Equatorial Sea', kind='sea', px=[530,740]),
 dict(name='Lake Zenith', kind='lake', px=[1000,252], note='Northeast highland lake, feeds River Kessar.', gameplay=CONFIRMED),
 dict(name='Lake Veyra', kind='lake', px=[662,622], note='South-central lake, feeds River Ardent. Candidate for Garrick Tane\'s unspecified lake.'),
 dict(name='River Vex', kind='river', px=[490,510], note='Titanspine Mountains → Western Drift Ocean.'),
 dict(name='River Ardent', kind='river', px=[695,735], note='Central mountains → Equatorial Sea.'),
 dict(name='River Kessar', kind='river', px=[1060,470], note='Through Ironwood Forest → Eastern Frontier Ocean.'),
 dict(name='River Solis', kind='river', px=[915,865], note='Through the Stormbreaker Range → Equatorial Sea.'),
]

world = dict(
  schema_version='1.0.0',
  planet=dict(name='Ryzen-5', region='Northern Frontier Region', politics='Anarchist Territories', system='Tripaternal Star System',
              sector='Crusted Nebula — Midrim Sector', circumference_km=12289, diameter_km=3912, gravity_g=0.41,
              surface_water_pct_stated=38, population=12_000_000, farthest_points_km=6145, hours_per_sol=30),
  projection=dict(type='equirectangular', atlas_px=[1536, 1024], lon_span_deg=270, lat_span_deg=180, prime_meridian_px=717,
                  km_per_px_at_equator=round(12289/360*270/1536, 4),
                  rationale='Atlas scale bar: 1000 km = 166 px (6.0 km/px). Atlas height 1024 px x 6.0 = 6,144 km = pole-to-pole (half the 12,289 km circumference), and width 9,216 km = 270 deg of longitude. The atlas is therefore treated as an equirectangular projection; the off-map 90 deg is assumed to be ocean. Prime meridian set through Zixel.'),
  travel_modes={
    'road':  dict(name='Road convoy / ground transit', kmh=55, source='proposed tuning'),
    'sea':   dict(name='Coastal freighter / ferry', kmh=35, source='proposed tuning'),
    'air':   dict(name='Airship', kmh=140, source='proposed tuning'),
  },
  nodes=nodes, routes=R, trade_corridors=trade, regions=regions, waters=waters,
  open_questions=[
    'RESOLVED (user): Kitsah is the garbled "2" north of Zixel; the "2" on the south-west coast is city 9, Soledad (pop 350,000, 38 km²).',
    'PROVISIONAL: duplicate outpost markers renumbered — Red Mesa Post (1) = printed "12" W of Titanspine; Scorpion Watch (2) = printed "3" on the Ashen Reach; Coyote Crossing (8) = printed "9" on Southreach; Southreach east "3" = new Outpost 16 (needs a name). Blackrock Station stays on the western Ashen Reach "3".',
    'Soledad (city 9) needs a city type (coastal? port?) — set to "City" for now.',
    'A stray "7" label is printed beside Kessar Bay with no outpost triangle.',
    'Kessar Bay is listed as a coastal city but drawn ~120 km inland on the River Kessar.',
    'Atlas land covers ~30% of the sphere (~40% of the mapped 270 deg), but the stated surface water is 38% (62% land).',
    'Western Act V facility city is still TBD; Port Veyra is the only major western city on the atlas.',
    'Bible lists 5 additional cities and 4 outposts for gameplay; confirmed so far: Kitsah, Kessar Bay, Wayfarer\'s Rest (+ Port Veyra via side mission S3-01) and Titan Watch.',
  ],
)
open('content/world.json', 'w').write(json.dumps(world, indent=1, ensure_ascii=False))
print(len(nodes), 'nodes', len(R), 'routes')
