import bpy, math, random, os
from mathutils import Vector
random.seed(11)
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
mats={}
def mat(name, color):
 color=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in color); m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1); m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85; mats[name]=m; return m
for n,c in {'plaster':(.83,.76,.59),'wood':(.35,.20,.10),'timber':(.45,.26,.105),'cut':(.70,.47,.23),'roof':(.78,.30,.14),'tile':(.85,.38,.19),'blue':(.055,.23,.55),'blueLight':(.08,.32,.67),'stone':(.40,.43,.44),'stoneLight':(.57,.58,.55),'dark':(.075,.065,.046),'leaf':(.23,.37,.15),'leafLight':(.30,.44,.18),'wheat':(.88,.58,.07),'wheatLight':(1,.72,.15),'soil':(.39,.28,.10),'skin':(.79,.51,.29),'cream':(.93,.85,.64),'water':(.06,.23,.31)}.items(): mat(n,c)
def finish(o,n,m): o.name=n; o.data.materials.append(mats[m]); return o
def cube(n,p,s,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p); o=bpy.context.object; o.scale=s; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); return finish(o,n,m)
def cyl(n,p,r,d,m,vertices=8,r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=d,location=p); return finish(bpy.context.object,n,m)
def ico(n,p,s,m):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=p); o=bpy.context.object; o.scale=s; return finish(o,n,m)
def beam(n,a,b,w,m):
 a,b=Vector(a),Vector(b); o=cube(n,(a+b)/2,(w,w,(b-a).length),m); o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o
def roof(w,d,z,h,m='roof'):
 verts=[(-w/2,-d/2,z),(w/2,-d/2,z),(0,-d/2,z+h),(-w/2,d/2,z),(w/2,d/2,z),(0,d/2,z+h)]
 mesh=bpy.data.meshes.new('gable');mesh.from_pydata(verts,[],[(0,1,2),(5,4,3),(0,2,5,3),(2,1,4,5),(3,4,1,0)]);o=bpy.data.objects.new('Roof',mesh);bpy.context.collection.objects.link(o);finish(o,'Roof',m)
 # fine tile courses running down each roof slope
 for side in [-1,1]:
  for row in range(1,5):
   x=side*w/2*row/5; zz=z+h*(1-row/5)+.025
   beam('Tile course',(x,-d/2,zz),(x,d/2,zz),.027,'tile' if m=='roof' else 'blueLight' if m=='blue' else 'cut')
  for col in range(1,7):
   y=-d/2+d*col/7
   beam('Tile seam',(0,y,z+h+.02),(side*w/2,y,z+.02),.016,'tile' if m=='roof' else m)
 for y in [-d/2,d/2]:
  beam('Bargeboard',(-w/2,y,z),(0,y,z+h),.11,'timber');beam('Bargeboard',(0,y,z+h),(w/2,y,z),.11,'timber')
def fence(w=3,d=3):
 for y in [-d/2,d/2]:
  for x in [-w/2,0,w/2]: cube('Fence post',(x,y,.43),(.13,.13,.86),'wood')
  for z in [.30,.65]:cube('Fence rail',(0,y,z),(w,.085,.095),'timber')
 for x in [-w/2,w/2]:
  for z in [.30,.65]:cube('Fence rail',(x,0,z),(.085,d,.095),'timber')
def house():
 cube('Foundation',(0,0,.13),(2.65,2.3,.26),'stoneLight');cube('Walls',(0,0,1.03),(2.5,2.15,1.8),'plaster');roof(2.9,2.6,1.95,1.22)
 for x in [-1.2,1.2]:
  for y in [-1.08,1.08]:cube('Oak corner',(x,y,1),(.13,.13,1.9),'wood')
 cube('Crossbeam',(0,-1.1,1.89),(2.45,.1,.13),'wood');cube('Door',(.32,-1.095,.59),(.49,.055,1.07),'wood');cube('Door inset',(.32,-1.13,.59),(.36,.03,.93),'timber');cyl('Handle',(.46,-1.17,.61),.035,.06,'wheat')
 for x in [-.75,.82]:
  cube('Window frame',(x,-1.105,1.25),(.40,.055,.48),'timber');cube('Window glass',(x,-1.14,1.25),(.29,.025,.36),'dark');cube('Mullion',(x,-1.16,1.25),(.035,.02,.36),'cream')
 for x in [-.72,.72]:beam('Gable timber',(0,-1.16,2.91),(x,-1.16,1.96),.10,'wood')
 cube('Chimney',(.8,.60,2.65),(.34,.38,1.25),'roof');cube('Chimney cap',(.8,.60,3.29),(.43,.48,.12),'tile');cube('Chimney opening',(.8,.60,3.355),(.25,.28,.018),'dark')
 cube('Side sill',(1.26,0,.28),(.08,2.1,.13),'wood');cube('Side beam',(1.26,0,1.84),(.08,2.1,.13),'wood')
 for y in [-.55,.55]:
  cube('Side window frame',(1.27,y,1.15),(.07,.44,.55),'timber');cube('Side window',(1.31,y,1.15),(.025,.31,.41),'dark')
 cube('Doorstep',(.32,-1.3,.12),(.68,.38,.16),'stoneLight')
 for x in [-1.55,1.55]:
  for y in [-1.55,0,1.4]:cube('Garden post',(x,y,.32),(.12,.12,.64),'wood')
  for z in [.23,.49]:cube('Garden rail',(x,-.07,z),(.08,2.95,.08),'timber')
 cube('Crate',(-1,-1.4,.23),(.4,.4,.46),'timber')
 for z in [.1,.35]:cube('Crate band',(-1,-1.61,z),(.43,.035,.045),'cut')
def bakery():
 # Open-sided stone oven workshop with a visible prep area, timber frame,
 # golden thatch and tall flue.
 cube('Stone foundation',(0,0,.12),(2.7,2.5,.24),'stone')
 cube('Open bakery floor',(0,0,.27),(2.5,2.2,.12),'cut')
 # A shallow rear service wall keeps the building grounded while the front
 # and right-hand sides remain completely open to the camera.
 cube('Rear service wall',(0,1.03,1.15),(1.25,.10,1.05),'plaster')
 for x in [-1.2,1.2]:
  cube('Timber corner post',(x,-1.14,1.36),(.13,.13,1.1),'wood')
  cube('Timber rear post',(x,1.04,1.36),(.13,.13,1.1),'wood')
 for z in [1.37,2.5]:cube('Open front crossbeam',(0,-1.15,z),(2.6,.16,.14),'wood')
 cube('Open side beam',(1.26,0,1.37),(.13,2.1,.14),'wood')
 roof(2.95,2.7,2.55,1.13,'cut')
 beam('Gable brace',(-1.15,-1.15,2.55),(0,-1.15,3.53),.12,'wood')
 beam('Gable brace',(1.15,-1.15,2.55),(0,-1.15,3.53),.12,'wood')
 # Standalone oven at the back-left, with its mouth turned toward the open
 # workspace so the fire and trays are readable from outside.
 cube('Oven body',(-.62,.52,.76),(.72,.52,.66),'stoneLight')
 cube('Oven mouth',(-.62,-.01,.78),(.52,.08,.42),'dark')
 ico('Oven embers',(-.62,-.12,.61),(.25,.08,.10),'roof')
 cube('Oven hearth',(-.62,-.10,.45),(.66,.20,.10),'stone')
 for x in [-.92,-.62,-.32]:
  ico('Oven bread tray',(x,-.09,.82),(.10,.13,.07),'wheatLight')
 # Low prep table and ingredient shelf make the baker's task legible.
 cube('Baker prep table',(.27,-.42,.72),(1.12,.42,.11),'cut')
 for x in [-.65,.65]:cube('Prep table leg',(.27+x*.7,-.42,.40),(.09,.10,.40),'wood')
 ico('Dough on prep table',(.27,-.48,.87),(.42,.20,.12),'cream')
 cube('Ingredient shelf',(.98,.28,1.08),(.10,.62,.08),'cut')
 for y in [-.12,.22,.55]:cyl('Ingredient jar',(.98,y,1.30),.11,.22,'cream',8)
 cube('Bakery tool rack',(.98,.88,1.56),(.07,.16,.52),'wood')
 for z in [1.42,1.70]:cube('Baking tool',(.90,.83,z),(.025,.05,.15),'stone')
 cube('Tall stone chimney',(.78,.55,3.2),(.53,.58,2.4),'stone')
 for z in [2.4,2.8,3.2,3.6,4.0]:cube('Chimney course',(.78,.245,z),(.55,.035,.08),'stoneLight')
 cube('Chimney rim',(.78,.55,4.43),(.66,.7,.16),'stoneLight')
 cube('Flue opening',(.78,.55,4.52),(.39,.43,.02),'dark')
 beam('Sign bracket',(1.2,-1.15,2.4),(1.2,-1.77,2.4),.07,'wood')
 cube('Red bakery sign',(1.2,-1.75,2.12),(.45,.08,.43),'roof')
 ico('Sign loaf',(1.2,-1.81,2.12),(.17,.025,.075),'cream')
def tree():
 cyl('Trunk',(0,0,.65),.19,1.3,'wood',6)
 for z,r,d in [(1.4,.93,1.45),(2.07,.74,1.35),(2.66,.48,1.2)]:cyl('Pine',(0,0,z),r,d,'leaf' if z<2 else 'leafLight',5,0)
def rock():ico('Boulder',(0,0,.52),(.85,.7,.87),'stone');ico('Boulder',( .62,.15,.2),(.4,.38,.42),'stoneLight')
def well():
 cyl('Well water',(0,0,.18),.63,.08,'water',12)
 for row in range(3):
  for i in range(12):
   a=(i+row%2*.5)*math.tau/12;o=cube('Masonry',(.7*math.cos(a),.7*math.sin(a),.14+row*.23),(.38,.22,.21),'stoneLight' if i%3 else 'stone');o.rotation_euler.z=a+math.pi/2
 for x in [-.68,.68]:cube('Well post',(x,0,1.05),(.13,.15,1.8),'wood')
 roof(1.85,1.25,1.9,.55,'blue');beam('Spindle',(-.65,0,1.25),(.65,0,1.25),.13,'timber');beam('Rope',(0,0,.5),(0,0,1.35),.025,'cream')
def farm():
 # The farm is now the farmhouse that anchors player-planted grain plots.
 cube('Foundation',(0,0,.13),(2.85,2.5,.26),'stoneLight');cube('Farmhouse walls',(0,0,1.0),(2.65,2.3,1.75),'plaster');roof(3.05,2.75,1.9,1.15,'timber')
 for x in [-1.26,1.26]:
  for y in [-1.12,1.12]:cube('Oak corner',(x,y,.98),(.13,.13,1.82),'wood')
 cube('Stable door',(.42,-1.18,.62),(.72,.06,1.12),'timber');beam('Door brace',(-.23,-1.25,.18),(1.05,-1.25,1.04),.055,'cut')
 cube('Loft window',(-.62,-1.19,1.35),(.42,.05,.46),'dark');cube('Loft sill',(-.62,-1.24,1.08),(.52,.08,.08),'wood')
 cube('Awning post',(-1.58,-.92,.65),(.11,.11,1.3),'wood');cube('Awning post',(-1.58,.92,.65),(.11,.11,1.3),'wood')
 beam('Awning',(-1.62,-1.05,1.32),(-1.62,1.05,1.32),.12,'timber')
 for row in range(2):
  for col in range(3):
   sack=ico('Grain sack',(-1.72,-.55+col*.5,.24+row*.28),(.23,.3,.22),'cream');sack.rotation_euler.z=.12*(col-1)
 cube('Farm crate',(.98,-1.46,.24),(.45,.42,.48),'cut')

def grainfield(stage='ripe'):
 cube('Tilled soil',(0,0,.025),(.96,.96,.05),'soil')
 for x in [-.63,-.21,.21,.63]:cube('Furrow',(x,0,.065),(.045,.86,.035),'cut' if stage=='sown' else 'soil')
 if stage=='sown':return
 rows=4 if stage=='sprout' else 5
 cols=4 if stage=='sprout' else 5
 height={'sprout':.18,'growing':.43,'ripe':.68}[stage]
 for x in range(rows):
  for y in range(cols):
   xx=-.62+x*(1.24/max(1,rows-1))+random.uniform(-.025,.025);yy=-.62+y*(1.24/max(1,cols-1))+random.uniform(-.02,.02)
   color='leafLight' if stage=='sprout' else ('wheat' if stage=='growing' else ('wheatLight' if random.random()>.38 else 'wheat'))
   cyl('Grain stalk',(xx,yy,height/2+.07),.014 if stage=='sprout' else .02,height,color,3)
   if stage!='sprout':cyl('Grain head',(xx,yy,height+.05),.055 if stage=='growing' else .075,.16 if stage=='growing' else .23,color,4,.01)
def lumberyard():
 for x in [-1.15,1.15]:
  for y in [-.9,.9]:cube('Posts',(x,y,1.05),(.18,.18,2.1),'timber')
 roof(2.85,2.5,2.1,.95,'timber')
 for row in range(3):
  for col in range(4-row):
   x=-.6+col*.36+row*.18;z=.20+row*.30;o=cyl('Log',(x,.35,z),.19,1.7,'wood',8);o.rotation_euler.x=math.pi/2;o=cyl('Cut end',(x,-.515,z),.168,.02,'cut',8);o.rotation_euler.x=math.pi/2
 for x in [1.6,1.96,2.32]:
  o=cyl('Outside log',(x,.15,.22),.21,1.9,'wood',8);o.rotation_euler.x=math.pi/2
  o=cyl('Outside log end',(x,-.81,.22),.18,.022,'cut',8);o.rotation_euler.x=math.pi/2
 cube('Workbench',(.6,-.5,.65),(1,.5,.12),'timber')
 for x in [.2,1]:cube('Bench leg',(x,-.5,.31),(.1,.3,.62),'wood')
def mine():
 for p,s in [((0,.55,1.35),(1.5,1.2,1.85)),((-1.1,0,.85),(.8,.8,1.2)),((1.1,0,1),(.85,.8,1.45)),((0,1.1,1.9),(1.1,.85,1.2))]:ico('Mountain rock',p,s,'stone')
 cube('Entrance',(0,-.69,.82),(1.3,.05,1.6),'dark')
 for x in [-.7,.7]:cube('Mine support',(x,-.82,.86),(.22,.24,1.72),'timber')
 cube('Lintel',(0,-.85,1.69),(1.75,.28,.24),'cut')
 for y in [-1,-1.4,-1.8,-2.2]:cube('Sleeper',(0,y,.04),(1.05,.16,.08),'wood')
 for x in [-.32,.32]:cube('Rail',(x,-1.55,.11),(.065,1.6,.07),'stone')
 cube('Mine cart',(0,-1.7,.46),(.7,.65,.5),'timber');ico('Ore',(0,-1.7,.73),(.32,.3,.18),'stone')
def windmill():
 cyl('Mill tower',(0,0,1.5),.9,3,'plaster',8,.55);cyl('Mill roof',(0,0,3.35),.85,.9,'roof',8,0);cube('Door',(0,-.89,.53),(.38,.06,1.02),'wood')
 # sails exported as separate named object and pivot for animation in Three
 bpy.ops.object.empty_add(location=(0,-.91,2.6));pivot=bpy.context.object;pivot.name='Sails';bpy.context.view_layer.update()
 for a in [0,math.pi/2,math.pi,math.pi*1.5]:
  v=Vector((math.cos(a),0,math.sin(a)));start=Vector((0,-.94,2.6));end=start+v*1.95
  o=beam('Sail spar',start,end,.10,'wood');o.parent=pivot;o.matrix_parent_inverse=pivot.matrix_world.inverted()
  center=start+v*1.23;o=cube('Canvas sail',center,(.68,.09,1.55),'cream');o.rotation_euler.y=math.pi/2-a;o.parent=pivot;o.matrix_parent_inverse=pivot.matrix_world.inverted()
 o=cyl('Hub',(0,-1,2.6),.18,.22,'timber');o.rotation_euler.x=math.pi/2
 fence(3.9,3.9)
def watchtower():
 for x in [-.64,.64]:
  for y in [-.64,.64]:cube('Tower leg',(x,y,1.6),(.19,.19,3.2),'timber')
 for y in [-.64,.64]:
  beam('Braces',(-.64,y,.2),(.64,y,2.6),.11,'wood');beam('Braces',(.64,y,.2),(-.64,y,2.6),.11,'wood')
 cube('Platform',(0,0,2.8),(1.7,1.7,.19),'timber')
 for y in [-.72,.72]:cube('Parapet',(0,y,3.16),(1.55,.1,.5),'timber')
 for x in [-.72,.72]:cube('Parapet',(x,0,3.16),(.1,1.55,.5),'timber');cube('Roof post',(x,0,3.7),(.12,.12,.9),'wood')
 roof(2,2,4,.8,'blue');beam('Flagpole',(0,0,4.7),(0,0,5.5),.05,'wood');cube('Flag',(.28,0,5.32),(.55,.035,.28),'blue')
def townhall():
 cube('Foundation',(0,0,.15),(3.3,3.5,.3),'stoneLight');cube('Hall',(0,0,1.3),(3,3.2,2.3),'plaster');roof(3.5,3.65,2.48,1.55,'blue')
 cube('Tower',(.75,-1,2.8),(1.08,1.2,5.6),'plaster');cyl('Tower roof',(.75,-1,6.15),1,1.2,'blue',4,0).rotation_euler.z=math.pi/4
 for z in [1.6,4.75]:cube('Tower window',(.75,-1.611,z),(.27,.03,.57),'dark')
 cube('Entry',(.75,-1.62,.78),(.55,.045,1.28),'wood')
 for x in [-1,-.3]:cube('Window',(x,-1.61,1.5),(.23,.025,.58),'dark')
 for y in [-2,-1.85,-1.7]:cube('Steps',(.75,y,.1+(y+2)*.5),(.95,.22,.20+(y+2)),'stoneLight')
 beam('Flagpole',(.75,-1,6.7),(.75,-1,7.5),.045,'wood');cube('Blue banner',(1.08,-1,7.31),(.65,.02,.28),'blue')
def worker():
 cube('Tunic',(0,0,.51),(.23,.16,.3),'blue');ico('Head',(0,0,.79),(.115,.1,.13),'skin');cyl('Cap',(0,0,.9),.13,.12,'cream',6,.11)
 for x in [-.075,.075]:beam('Leg',(x,0,.10),(x,0,.38),.08,'dark');cube('Shoe',(x,-.035,.07),(.09,.17,.09),'wood')
 for x in [-.16,.16]:beam('Arm',(x,0,.62),(x,-.02,.36),.07,'cream');ico('Hand',(x,-.02,.33),(.055,.055,.06),'skin')
assets={'tree':tree,'rock':rock,'fence':fence,'house':house,'bakery':bakery,'well':well,'farm':farm,'grainfield':lambda:grainfield('ripe'),'grainfield_sown':lambda:grainfield('sown'),'grainfield_sprout':lambda:grainfield('sprout'),'grainfield_growing':lambda:grainfield('growing'),'grainfield_ripe':lambda:grainfield('ripe'),'lumberyard':lumberyard,'mine':mine,'windmill':windmill,'watchtower':watchtower,'townhall':townhall,'worker':worker}
only_asset=os.environ.get("ONLY_ASSET")
if only_asset: assets={only_asset:assets[only_asset]}
for name,fn in assets.items():
 bpy.ops.object.select_all(action='DESELECT');before=set(bpy.data.objects);fn();objects=list(set(bpy.data.objects)-before)
 # Merge static geometry by material to keep browser draw calls low.
 for material in mats.values():
  group=[o for o in list(set(bpy.data.objects)-before) if o.type=='MESH' and o.parent is None and len(o.data.materials) and o.data.materials[0]==material]
  if len(group)>1:
   bpy.ops.object.select_all(action='DESELECT')
   for o in group:o.select_set(True)
   bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join()
 objects=list(set(bpy.data.objects)-before);bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models',name+'.glb'),use_selection=True,export_format='GLB')
 collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
 for o in objects:
  for c in list(o.users_collection):c.objects.unlink(o)
  collection.objects.link(o)
 collection.hide_viewport=True;collection.hide_render=True
# Present the editable library as a spaced gallery in the native Blender file.
for i,name in enumerate(assets):
 collection=bpy.data.collections[name];collection.hide_viewport=False;collection.hide_render=False
 for o in collection.objects:
  if o.parent is None:o.location+=Vector(((i%4)*7,(i//4)*8,0))
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_distance=32
   area.spaces.active.region_3d.view_location=(10,8,1)
   area.spaces.active.shading.color_type='MATERIAL'
if not only_asset: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'blender','village-assets.blend'))
print(f'All {len(assets)} assets exported.')
