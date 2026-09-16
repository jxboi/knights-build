import bpy, math, random, os
from mathutils import Vector, Matrix
random.seed(11)
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
mats={}
def mat(name, color):
 color=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in color); m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1); m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85; mats[name]=m; return m
for n,c in {'plaster':(.83,.76,.59),'wood':(.35,.20,.10),'timber':(.45,.26,.105),'cut':(.70,.47,.23),'roof':(.78,.30,.14),'tile':(.85,.38,.19),'thatch':(.57,.38,.15),'thatchLight':(.78,.55,.22),'blue':(.055,.23,.55),'blueLight':(.08,.32,.67),'stone':(.40,.43,.44),'stoneBlue':(.28,.34,.34),'stoneLight':(.57,.58,.55),'slate':(.38,.36,.48),'slateLight':(.55,.52,.66),'gold':(.86,.62,.20),'goldLight':(.96,.79,.34),'shingle':(.60,.42,.21),'shingleLight':(.81,.61,.32),'wine':(.30,.08,.24),'wineLight':(.50,.16,.38),'dark':(.075,.065,.046),'leaf':(.23,.37,.15),'leafLight':(.30,.44,.18),'wheat':(.88,.58,.07),'wheatLight':(1,.72,.15),'soil':(.39,.28,.10),'skin':(.79,.51,.29),'cream':(.93,.85,.64),'water':(.06,.23,.31)}.items(): mat(n,c)
def finish(o,n,m): o.name=n; o.data.materials.append(mats[m]); return o
def cube(n,p,s,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p); o=bpy.context.object; o.scale=s; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); return finish(o,n,m)
def cyl(n,p,r,d,m,vertices=8,r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=d,location=p); return finish(bpy.context.object,n,m)
def ico(n,p,s,m):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=p); o=bpy.context.object; o.scale=s; return finish(o,n,m)
def beam(n,a,b,w,m):
 a,b=Vector(a),Vector(b); o=cube(n,(a+b)/2,(w,w,(b-a).length),m); o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o
def roof(w,d,z,h,m='roof',cy=0,open_front=False,trim=.11,courses=True):
 verts=[(-w/2,cy-d/2,z),(w/2,cy-d/2,z),(0,cy-d/2,z+h),(-w/2,cy+d/2,z),(w/2,cy+d/2,z),(0,cy+d/2,z+h)]
 faces=[(5,4,3),(0,2,5,3),(2,1,4,5),(3,4,1,0)]
 if not open_front: faces.insert(0,(0,1,2))
 mesh=bpy.data.meshes.new('gable');mesh.from_pydata(verts,[],faces);o=bpy.data.objects.new('Roof',mesh);bpy.context.collection.objects.link(o);finish(o,'Roof',m)
 # fine tile courses running down each roof slope, skipped on small gables
 # such as dormers where the ribs would read as clutter instead of tiles
 if courses:
  for side in [-1,1]:
   for row in range(1,5):
    x=side*w/2*row/5; zz=z+h*(1-row/5)+.025
    beam('Tile course',(x,cy-d/2,zz),(x,cy+d/2,zz),.027,'tile' if m=='roof' else 'blueLight' if m=='blue' else 'thatchLight' if m=='thatch' else 'goldLight' if m=='gold' else 'shingleLight' if m=='shingle' else 'leafLight' if m=='leaf' else 'cut')
   for col in range(1,7):
    y=cy-d/2+d*col/7
    beam('Tile seam',(0,y,z+h+.02),(side*w/2,y,z+.02),.016,'tile' if m=='roof' else 'thatchLight' if m=='thatch' else 'goldLight' if m=='gold' else 'shingleLight' if m=='shingle' else 'leafLight' if m=='leaf' else m)
 for y in [cy-d/2,cy+d/2]:
  beam('Bargeboard',(-w/2,y,z),(0,y,z+h),trim,'timber');beam('Bargeboard',(0,y,z+h),(w/2,y,z),trim,'timber')
def placed_roof(w,d,z,h,m='roof',cx=0,cy=0,angle=0,trim=.11,courses=True):
 # Build a gable with roof() and move the whole assembly - slopes, tile
 # courses and bargeboards - onto a subordinate structure such as a dormer.
 before=set(bpy.data.objects);roof(w,d,z,h,m,0,False,trim,courses)
 # beam() sets rotation_euler, which Blender only folds into matrix_world on
 # the next depsgraph update. Without this the stale matrix of a just-created
 # bargeboard gets rotated into empty space.
 bpy.context.view_layer.update()
 place=Matrix.Translation((cx,cy,0))@Matrix.Rotation(angle,4,'Z')
 for o in set(bpy.data.objects)-before:o.matrix_world=place@o.matrix_world
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
 # Three continuous walls form a compact stone-and-timber bakehouse. Only
 # the viewer-facing side is open, like a cutaway shopfront, so the baker and
 # production loop remain readable without making the roof look unsupported.
 cube('Stone foundation',(0,0,.06),(2.62,2.42,.12),'stoneBlue')
 cube('Foundation cap',(0,0,.15),(2.52,2.32,.06),'stoneLight')
 cube('Bakery floor',(0,0,.21),(2.36,2.08,.06),'cut')

 # A continuous masonry dado and plaster upper wall run around the rear and
 # both sides. Their dimensions meet exactly at the corners and roof plate.
 cube('Rear stone wall',(0,1.00,.55),(2.30,.16,.62),'stoneBlue')
 cube('Rear plaster wall',(0,1.00,1.53),(2.30,.14,1.34),'plaster')
 for x in [-1.08,1.08]:
  cube('Side stone wall',(x,0,.55),(.14,2.00,.62),'stoneBlue')
  cube('Side plaster wall',(x,0,1.53),(.14,2.00,1.34),'plaster')

 # Timbering is fixed against the wall faces, rather than standing as loose
 # porch posts. The front lintel lands directly on the two side walls.
 for x in [-1.16,1.16]:
  cube('Wall corner timber',(x,0,1.53),(.10,1.96,.12),'wood')
  cube('Front wall end timber',(x,-.97,1.53),(.12,.10,1.34),'wood')
 cube('Rear wall rail',(0,.925,.86),(2.18,.08,.10),'wood')
 cube('Left wall rail',(-1.155,0,.86),(.08,1.90,.10),'wood')
 cube('Right wall rail',(1.155,0,.86),(.08,1.90,.10),'wood')
 cube('Front lintel',(0,-.97,2.15),(2.30,.12,.10),'wood')
 cube('Rear roof plate',(0,.98,2.15),(2.30,.12,.10),'wood')

 # The full-depth roof rests on the wall plates. The open gable frame is
 # supported by the lintel and leaves the entire front elevation accessible.
 roof(2.78,2.30,2.20,1.08,'thatch',.04,True)
 beam('Open gable brace',(-1.10,-1.11,2.20),(0,-1.11,3.28),.09,'wood')
 beam('Open gable brace',(1.10,-1.11,2.20),(0,-1.11,3.28),.09,'wood')

 # The hearth, oven, chimney shaft and cap overlap slightly at their joins,
 # producing one continuous masonry mass with no detached stone courses.
 cube('Oven hearth',(-.68,.48,.32),(.78,.70,.16),'stone')
 cube('Oven base',(-.68,.62,.72),(.72,.60,.64),'stoneBlue')
 cyl('Oven dome',(-.68,.62,1.25),.68,.58,'stoneLight',8,.50)
 cube('Oven mouth',(-.68,.30,.86),(.46,.08,.40),'dark')
 ico('Oven embers',(-.68,.245,.70),(.25,.07,.09),'roof')
 for x in [-.94,-.68,-.42]:
  ico('Fresh bread',(x,.235,.90),(.10,.10,.065),'wheatLight')
 cube('Oven mantle',(-.68,.245,1.17),(.62,.10,.09),'stone')
 cube('Oven chimney',(-.68,.72,2.46),(.44,.46,1.84),'stoneBlue')
 cube('Chimney cap',(-.68,.72,3.44),(.56,.58,.12),'stoneLight')
 cube('Flue opening',(-.68,.72,3.51),(.34,.36,.02),'dark')

 # The connected four-legged table and wall-mounted shelves complete the
 # visible service nook while keeping the sole open side unobstructed.
 cube('Baker prep table',(.25,-.45,.82),(1.05,.50,.12),'timber')
 for x in [-.15,.65]:
  for y in [-.61,-.29]:
   cube('Prep table leg',(x,y,.50),(.08,.08,.52),'wood')
 ico('Dough on prep table',(.25,-.45,.95),(.38,.17,.09),'cream')
 for x in [.00,.25,.50]:
  ico('Loaf on counter',(x,-.58,.94),(.12,.09,.055),'wheatLight')
 cube('Bread display shelf',(1.00,-.10,1.02),(.10,.72,.08),'timber')
 for y in [-.36,-.10,.16]:
  cyl('Ingredient jar',(1.00,y,1.18),.09,.22,'cream',8)
 cube('Tool rack',(1.00,.70,1.48),(.08,.12,.42),'wood')
 for z in [1.34,1.57]:
  cube('Baking tool',(.94,.64,z),(.025,.04,.14),'stone')

 # A small loaf sign hangs from the front roof plate rather than from an
 # isolated post.
 beam('Sign bracket',(1.02,-1.03,2.12),(1.02,-1.48,2.12),.055,'wood')
 cube('Bakery sign',(1.02,-1.50,1.88),(.34,.07,.30),'roof')
 ico('Sign loaf',(1.02,-1.55,1.88),(.14,.022,.06),'cream')
def inn():
 # A compact half-timbered coaching inn based on the reference: two stories,
 # red tile roof, open frontage, striped awning, hanging sign and outdoor tables.
 cube('Inn foundation',(0,0,.10),(3.55,2.55,.20),'stoneBlue')
 cube('Ground floor',(0,.05,.86),(3.35,2.35,1.52),'stoneLight')
 cube('Upper floor',(0,.10,2.00),(3.55,2.45,1.05),'plaster')
 cube('Upper floor ledge',(0,-1.20,1.49),(3.70,.16,.16),'timber')
 roof(3.95,2.95,2.56,1.22,'roof',.10)

 # Heavy oak framing keeps the pale plaster bays readable at game scale.
 for x in [-1.66,-.55,.55,1.66]:
  cube('Front upright',(x,-1.145,2.00),(.10,.10,1.05),'wood')
 for z in [1.52,2.48]:cube('Front crossbeam',(0,-1.15,z),(3.45,.10,.10),'wood')
 for x in [-1.08,0,1.08]:
  beam('Front diagonal',(x-.42,-1.26,1.55),(x+.42,-1.26,2.45),.065,'timber')
 for x in [-1.10,0,1.10]:
  cube('Upper window frame',(x,-1.235,2.03),(.30,.055,.36),'timber')
  cube('Upper window glass',(x,-1.27,2.03),(.20,.025,.26),'dark')
  cube('Window mullion',(x,-1.30,2.03),(.025,.02,.25),'cream')

 # The ground floor reads as an open tavern front, with a warm service counter.
 cube('Tavern opening',(-.40,-1.205,.86),(1.82,.05,.92),'dark')
 cube('Inn door',(1.10,-1.23,.78),(.62,.06,1.30),'wood')
 cube('Door inset',(1.10,-1.275,.78),(.46,.025,1.12),'timber')
 cyl('Door handle',(1.28,-1.32,.82),.035,.06,'wheat')
 cube('Serving counter',(-.42,-1.42,.72),(1.86,.42,.16),'cut')
 for x in [-1.18,.32]:cube('Counter post',(x,-1.42,.38),(.10,.10,.60),'wood')
 for x in [-1.05,-.62,-.18,.20]:ico('Bread on counter',(x,-1.66,.86),(.13,.08,.06),'wheatLight')

 # Red-and-cream market awning, echoing the striped canopy in the reference.
 cube('Awning beam',(-.42,-1.64,1.47),(2.22,.10,.10),'wood')
 for i in range(6):
  x=-1.34+i*.37
  canopy=cube('Awning stripe',(x,-1.58,1.56),(.34,.82,.055),'cream' if i%2 else 'roof')
  canopy.rotation_euler.x=-.18
 for x in [-1.48,.64]:cube('Awning post',(x,-1.92,.73),(.08,.08,1.38),'wood')

 # A projecting sign, casks and crates give the silhouette a lively roadside feel.
 beam('Inn sign bracket',(1.52,-1.18,2.38),(1.52,-1.72,2.38),.055,'wood')
 beam('Inn sign chain',(1.52,-1.69,2.38),(1.52,-1.69,2.12),.022,'dark')
 cube('Inn sign',(1.52,-1.70,1.94),(.38,.07,.36),'blue')
 ico('Inn sign mark',(1.52,-1.75,1.94),(.11,.022,.11),'wheatLight')
 for x,z in [(1.52,.34),(1.20,.26)]:
  barrel=cyl('Ale cask',(x,-1.48,z),.24,.56,'timber',10,.21);barrel.rotation_euler.x=math.pi/2
  for yy in [-1.70,-1.26]:
   ring=cyl('Cask band',(x,yy,z),.255,.035,'stone',10,.245);ring.rotation_euler.x=math.pi/2
 cube('Inn crate',(1.48,-1.86,.20),(.48,.42,.40),'cut')

 # Three clear seats line up with the runtime meal points.
 for x in [-1.05,0,1.05]:
  cube('Dining table',(x,-1.66,.58),(.72,.46,.10),'timber')
  cube('Table leg',(x,-1.66,.30),(.10,.10,.52),'wood')
  cube('Dining bench',(x,-1.98,.40),(.72,.22,.10),'cut')
  for bx in [x-.25,x+.25]:cube('Bench leg',(bx,-1.98,.20),(.07,.07,.36),'wood')
  ico('Table loaf',(x,-1.66,.68),(.12,.08,.055),'wheatLight')
def school():
 # A village schoolhouse taken from the reference art: a chunky slate plinth,
 # pale plaster walls, a steep golden tile roof, a projecting clock gable over
 # the arched entry, and a red pennant flying above the ridge.
 cube('School plinth',(0,0,.11),(3.62,3.12,.22),'slate')
 cube('Plinth cap',(0,0,.27),(3.46,2.96,.10),'slateLight')

 # One continuous masonry dado carries the walls. The lighter blocks are cut
 # into its faces rather than left as detached stones floating off the wall.
 cube('Stone dado',(0,0,.58),(3.38,2.88,.56),'slate')
 for i in range(8):
  x=-1.54+i*.44
  if i%2:
   cube('Front facing stone',(x,-1.445,.58),(.38,.05,.24),'slateLight')
   cube('Rear facing stone',(x,1.445,.58),(.38,.05,.24),'slateLight')
 for i in range(7):
  y=-1.23+i*.41
  for x in [-1.695,1.695]:
   if i%2: cube('Side facing stone',(x,y,.58),(.05,.35,.24),'slateLight')
 cube('Dado cap',(0,0,.89),(3.46,2.96,.10),'slateLight')

 # Plaster upper walls, oak corner posts and a wall plate the roof sits on.
 cube('School walls',(0,0,1.64),(3.26,2.76,1.44),'plaster')
 for x in [-1.60,1.60]:
  for y in [-1.34,1.34]:cube('Corner post',(x,y,1.64),(.14,.14,1.48),'wood')
 cube('Front wall rail',(0,-1.39,2.26),(3.20,.10,.12),'wood')
 cube('Rear wall rail',(0,1.39,2.26),(3.20,.10,.12),'wood')
 for x in [-.92,.92]:
  cube('Rear window sill',(x,1.44,1.18),(.58,.14,.10),'slateLight')
  cube('Rear window frame',(x,1.42,1.56),(.48,.07,.66),'timber')
  cube('Rear window glass',(x,1.47,1.56),(.36,.03,.54),'wheatLight')
  cube('Rear window mullion',(x,1.50,1.56),(.04,.03,.52),'timber')
 cube('Wall plate',(0,0,2.39),(3.40,2.90,.14),'timber')
 roof(3.70,3.00,2.44,1.45,'gold')

 # The clock gable projects from the front wall and shelters the doorway.
 cube('Clock bay dado',(0,-1.66,.58),(1.62,.58,.56),'slate')
 cube('Clock bay cap',(0,-1.66,.89),(1.66,.62,.10),'slateLight')
 cube('Clock bay walls',(0,-1.62,1.72),(1.50,.62,1.60),'plaster')
 for x in [-.72,.72]:cube('Bay corner post',(x,-1.90,1.72),(.12,.12,1.64),'wood')
 cube('Bay lintel',(0,-1.94,2.46),(1.56,.12,.12),'wood')
 roof(1.78,.84,2.52,.94,'gold',-1.58)

 # Clock face, mounted flat on the gable it shares a plane with.
 rim=cyl('Clock rim',(0,-2.04,2.82),.46,.10,'timber',16);rim.rotation_euler.x=math.pi/2
 face=cyl('Clock face',(0,-2.08,2.82),.38,.06,'cream',16);face.rotation_euler.x=math.pi/2
 for i in range(12):
  a=i*math.tau/12
  cube('Clock tick',(math.sin(a)*.30,-2.11,2.82+math.cos(a)*.30),(.035,.02,.035),'dark')
 hour=cube('Hour hand',(.07,-2.12,2.90),(.045,.025,.22),'dark');hour.rotation_euler.y=.70
 minute=cube('Minute hand',(-.13,-2.12,2.92),(.04,.025,.32),'dark');minute.rotation_euler.y=-.90
 cyl('Clock boss',(0,-2.14,2.82),.05,.06,'wheatLight',8).rotation_euler.x=math.pi/2

 # Arched double door set in a dressed stone surround.
 cube('Doorway',(0,-1.92,1.30),(1.04,.06,.80),'dark')
 cyl('Doorway head',(0,-1.92,1.70),.52,.06,'dark',16).rotation_euler.x=math.pi/2
 for x in [-.25,.25]:
  cube('School door',(x,-1.96,1.32),(.47,.07,.84),'wood')
  cube('Door panel',(x,-2.00,1.36),(.33,.03,.66),'timber')
 cyl('Door head',(0,-1.96,1.70),.49,.07,'wood',16).rotation_euler.x=math.pi/2
 cube('Door mullion',(0,-2.01,1.46),(.05,.03,1.10),'timber')
 for x in [-.44,.44]:cube('Door band',(x,-2.01,1.24),(.10,.03,.60),'cut')
 for x in [-.11,.11]:cyl('Door handle',(x,-2.03,1.34),.04,.07,'wheat')
 for x in [-.62,.62]:cube('Door jamb',(x,-1.95,1.30),(.20,.14,.80),'slateLight')
 for i in range(9):
  a=math.pi*i/8
  o=cube('Arch voussoir',(math.cos(a)*.62,-1.95,1.70+math.sin(a)*.62),(.20,.14,.30),'slateLight' if i%2 else 'slate')
  o.rotation_euler.y=math.pi/2-a

 # Two shallow steps land on the plinth in front of the door.
 for i,(y,h,w) in enumerate([(-2.04,.62,1.62),(-2.26,.32,1.82)]):
  cube('Entry step',(0,y,h/2),(w,.22,h),'slateLight' if i else 'slate')

 # Tall arched windows, lit from within, in the reference's warm yellow.
 for x in [-1.16,1.16]:
  cube('Window sill',(x,-1.44,1.06),(.68,.14,.10),'slateLight')
  cube('Window frame',(x,-1.42,1.52),(.56,.07,.80),'timber')
  cyl('Window frame head',(x,-1.42,1.92),.28,.07,'timber',12).rotation_euler.x=math.pi/2
  cube('Window glass',(x,-1.47,1.52),(.42,.03,.68),'wheatLight')
  cyl('Window glass head',(x,-1.47,1.90),.21,.03,'wheatLight',12).rotation_euler.x=math.pi/2
  cube('Window mullion',(x,-1.50,1.58),(.045,.03,.78),'timber')
  cube('Window transom',(x,-1.50,1.58),(.40,.03,.045),'timber')
 for x in [-1.66,1.66]:
  s=1 if x>0 else -1
  for y in [-.52,.52]:
   cube('Side window sill',(x-s*.02,y,1.10),(.14,.62,.10),'slateLight')
   cube('Side window frame',(x,y,1.54),(.07,.50,.76),'timber')
   cube('Side window glass',(x+s*.045,y,1.54),(.03,.38,.62),'wheatLight')
   cube('Side window mullion',(x+s*.07,y,1.54),(.03,.04,.62),'timber')

 # Small dormers break the long roof slopes, as in the reference.
 for x in [-1.32,1.32]:
  s=1 if x>0 else -1
  cube('Dormer body',(x,-.42,2.96),(.64,.78,.72),'plaster')
  cube('Dormer frame',(x+s*.30,-.42,3.02),(.07,.44,.42),'timber')
  cube('Dormer glass',(x+s*.34,-.42,3.02),(.04,.34,.32),'wheatLight')
  cube('Dormer sill',(x+s*.31,-.42,2.72),(.12,.56,.09),'slateLight')
  placed_roof(.82,.62,3.28,.30,'gold',x,-.42,math.pi/2,.05,False)

 # Chimney, ridge pennant and a chalked notice board by the steps.
 cube('School chimney',(-1.02,1.02,3.10),(.46,.48,1.60),'slate')
 cube('Chimney cap',(-1.02,1.02,3.97),(.58,.60,.14),'slateLight')
 cube('Flue opening',(-1.02,1.02,4.05),(.34,.36,.02),'dark')
 beam('Flagpole',(0,-1.02,3.55),(0,-1.02,4.92),.055,'wood')
 cyl('Pole finial',(0,-1.02,4.97),.09,.14,'wheatLight',8)
 cube('Pennant',(.34,-1.02,4.66),(.60,.03,.30),'roof')
 for z in [4.76,4.56]:cube('Pennant tail',(.70,-1.02,z),(.22,.03,.10),'roof')
 for x in [-1.52,-.96]:cube('Notice post',(x,-2.12,.62),(.10,.10,1.24),'wood')
 cube('Notice board',(-1.24,-2.14,1.24),(.82,.07,.62),'timber')
 cube('Notice slate',(-1.24,-2.19,1.24),(.64,.04,.46),'dark')
 for z in [1.38,1.24,1.10]:cube('Chalk line',(-1.24,-2.22,z),(.44,.02,.035),'cream')
 cube('Notice ledge',(-1.24,-2.20,.90),(.86,.10,.07),'cut')
def vineyard():
 # A vintner's press house from the reference art: a broad shingled roof whose
 # ridge runs across the front, an open left bay where the vintner treads
 # grapes in a great wooden vat, a arched cellar mouth with casks on skids at
 # the right, and a red pennant over the left gable. Front elevation is -Y.
 cube('Vineyard plinth',(0,0,.11),(3.66,2.86,.22),'stone')
 cube('Plinth cap',(0,0,.27),(3.50,2.70,.10),'stoneLight')
 cube('Press house floor',(0,0,.35),(3.30,2.50,.08),'cut')

 # Rear and side walls: a continuous rubble dado under plaster, so the roof
 # always lands on masonry rather than on loose stones.
 for p,s in [((0,1.28,.55),(3.44,.16,.50)),((-1.66,0,.55),(.16,2.60,.50)),((1.66,0,.55),(.16,2.60,.50))]:
  cube('Wall dado',p,s,'stone')
 for p,s in [((0,1.28,1.42),(3.44,.14,1.28)),((-1.66,.06,1.42),(.14,2.48,1.28)),((1.66,.06,1.42),(.14,2.48,1.28))]:
  cube('Plaster wall',p,s,'plaster')
 cube('Dado cap',(0,.06,.83),(3.52,2.62,.08),'stoneLight')

 # The right half of the front is walled and holds the cellar arch; the left
 # half stays open as a working bay under two heavy posts.
 cube('Front dado',(.84,-1.26,.55),(1.82,.16,.50),'stone')
 cube('Front plaster',(.84,-1.26,1.42),(1.82,.14,1.28),'plaster')
 cube('Bay sill',(-.86,-1.26,.46),(1.50,.16,.32),'stone')
 cube('Bay sill cap',(-.86,-1.26,.65),(1.56,.22,.07),'stoneLight')
 for x in [-1.60,-.12]:
  cube('Bay post',(x,-1.26,1.20),(.17,.17,1.78),'wood')
  beam('Bay brace',(x,-1.30,1.72),(x+(.42 if x<-1 else -.42),-1.30,2.02),.08,'timber')
 cube('Front lintel',(0,-1.28,2.05),(3.58,.15,.15),'wood')
 cube('Wall plate',(0,.02,2.09),(3.60,2.84,.14),'timber')
 for x in [-1.72,1.72]:
  for y in [-1.32,1.32]:cube('Corner post',(x,y,1.28),(.15,.15,1.62),'wood')
 cube('Right wall rail',(1.735,.06,1.48),(.09,2.44,.11),'wood')
 cube('Left wall rail',(-1.735,.06,1.48),(.09,2.44,.11),'wood')
 for y in [-.62,.66]:
  beam('Left wall brace',(-1.75,y-.42,.90),(-1.75,y+.42,1.94),.07,'timber')
  beam('Right wall brace',(1.75,y-.42,.90),(1.75,y+.42,1.94),.07,'timber')
 for x in [.20,1.48]:
  beam('Front timbering',(x-.30,-1.35,.86),(x+.30,-1.35,1.98),.07,'timber')
 cube('Rear wall rail',(0,1.355,1.48),(3.40,.09,.11),'wood')
 for x in [-1.00,1.00]:
  beam('Rear timbering',(x-.38,1.37,.90),(x+.38,1.37,1.94),.07,'timber')
  cube('Rear vent frame',(x,1.37,1.62),(.44,.06,.40),'timber')
  cube('Rear vent',(x,1.41,1.62),(.32,.03,.28),'dark')
  for z in [1.56,1.68]:cube('Rear vent slat',(x,1.44,z),(.30,.03,.035),'timber')

 # The ridge runs left to right, so the long shingled slope faces the player.
 placed_roof(3.06,3.98,2.10,1.18,'shingle',0,0,math.pi/2)

 # Cellar arch with dressed voussoirs, the casks' route into the cellar.
 cube('Cellar mouth',(.84,-1.22,.99),(1.06,.12,.42),'dark')
 cyl('Cellar arch head',(.84,-1.22,1.20),.53,.12,'dark',16).rotation_euler.x=math.pi/2
 for x in [-.53,.53]:cube('Arch jamb',(.84+x,-1.30,.99),(.18,.14,.42),'stoneLight')
 for i in range(9):
  a=math.pi*i/8
  o=cube('Arch voussoir',(.84+math.cos(a)*.62,-1.30,1.20+math.sin(a)*.62),(.19,.14,.26),'stoneLight' if i%2 else 'stone')
  o.rotation_euler.y=math.pi/2-a
 cyl('Vent rim',(.84,-1.31,1.86),.22,.10,'timber',12).rotation_euler.x=math.pi/2
 cyl('Vent glass',(.84,-1.35,1.86),.15,.05,'wheatLight',12).rotation_euler.x=math.pi/2
 for a in [0,math.pi/2]:
  bar=cube('Vent bar',(.84,-1.37,1.86),(.28,.03,.035),'timber');bar.rotation_euler.y=a

 # The treading vat in the open bay, where the vintner works in full view.
 vat=cyl('Grape vat',(-.74,-.60,.78),.56,.82,'timber',12,.52)
 for z in [.50,1.08]:
  cyl('Vat band',(-.74,-.60,z),.585,.08,'dark',12,.545)
 cyl('Treading must',(-.74,-.60,1.17),.48,.05,'wineLight',12)
 for x,y in [(-.88,-.74),(-.58,-.46),(-.84,-.42)]:
  ico('Floating grapes',(x,y,1.20),(.12,.10,.05),'wine')
 beam('Treading paddle',(-.30,-.86,1.10),(-.22,-.86,1.92),.07,'wood')
 cube('Vat step',(-.74,-1.12,.46),(.66,.26,.32),'cut')
 beam('Lantern hook',(-.30,-1.14,2.00),(-.30,-1.14,1.74),.035,'dark')
 cube('Bay lantern',(-.30,-1.14,1.60),(.17,.17,.24),'timber')
 cube('Lantern light',(-.30,-1.14,1.60),(.19,.19,.15),'wheatLight')

 # Cask skids in front of the cellar arch.
 for x in [.28,1.16]:
  for y in [-1.44,-2.00]:cube('Cask skid',(x,y,.09),(.72,.12,.18),'wood')
  cask=cyl('Wine cask',(x,-1.72,.53),.34,.66,'timber',12,.30);cask.rotation_euler.x=math.pi/2
  for y in [-1.46,-1.98]:
   band=cyl('Cask band',(x,y,.53),.355,.05,'dark',12,.315);band.rotation_euler.x=math.pi/2
  cyl('Cask head',(x,-2.06,.53),.28,.04,'cut',12).rotation_euler.x=math.pi/2
  ico('Cask bung',(x,-2.09,.66),(.06,.03,.06),'wood')

 # A vine trellis on the sunny side, heavy with fruit.
 for y in [-1.10,-.10,.90]:cube('Trellis post',(1.94,y,.62),(.10,.10,1.24),'wood')
 for z in [.86,1.18]:cube('Trellis rail',(1.94,-.10,z),(.08,2.16,.08),'timber')
 for y in [-1.02,-.54,-.06,.42,.86]:
  ico('Vine leaf',(1.92,y,1.26),(.26,.22,.09),'leaf')
  ico('Vine leaf',(1.98,y+.22,1.14),(.20,.18,.08),'leafLight')
  ico('Grape cluster',(2.00,y+.08,.94),(.13,.12,.20),'wine')
 for y in [-.70,.30]:ico('Grape cluster',(1.90,y,.86),(.12,.11,.18),'wineLight')

 # Harvest crates and a hanging grape sign complete the roadside frontage.
 cube('Grape crate',(-1.52,-1.76,.20),(.52,.46,.40),'cut')
 for z in [.10,.32]:cube('Crate band',(-1.52,-1.99,z),(.55,.04,.05),'wood')
 for x,y in [(-1.63,-1.80),(-1.41,-1.72),(-1.52,-1.88)]:
  ico('Harvest grapes',(x,y,.41),(.11,.10,.06),'wine')
 cube('Grape basket',(-1.06,-1.90,.16),(.38,.38,.32),'timber')
 ico('Basket grapes',(-1.06,-1.90,.34),(.30,.30,.09),'wineLight')
 beam('Sign bracket',(1.60,-1.34,2.00),(1.60,-1.86,2.00),.055,'wood')
 beam('Sign chain',(1.60,-1.83,2.00),(1.60,-1.83,1.78),.022,'dark')
 cube('Vineyard sign',(1.60,-1.84,1.58),(.40,.07,.34),'timber')
 ico('Sign grapes',(1.60,-1.89,1.54),(.13,.022,.17),'wine')
 ico('Sign leaf',(1.60,-1.89,1.70),(.09,.022,.05),'leafLight')

 # Red pennant over the left gable, as in the reference.
 beam('Flagpole',(-1.52,0,3.05),(-1.52,0,4.08),.05,'wood')
 cyl('Pole finial',(-1.52,0,4.12),.075,.11,'wheatLight',8)
 cube('Pennant',(-1.24,0,3.86),(.52,.03,.26),'roof')
 for z in [3.95,3.77]:cube('Pennant tail',(-.94,0,z),(.18,.03,.09),'roof')
def storehouse():
 # Redesigned from the reference art: a fortified gatehouse store. A rubble
 # curtain wall carries a crenellated parapet between two round turrets with
 # amber conical roofs and red pennants; a central gatehouse tower rises over
 # the arched cart entry, and the village's crates, casks and sacks are stacked
 # at the gate. Front is -Y.
 cube('Storehouse footing',(0,.05,.09),(3.46,2.44,.18),'stoneBlue')
 cube('Footing cap',(0,.05,.24),(3.30,2.28,.12),'stoneLight')

 # Rubble curtain wall. The facing blocks are cut into the wall face rather
 # than left floating, and they step around the archway.
 cube('Curtain wall',(0,.12,1.12),(2.52,1.92,1.64),'stone')
 for row in range(5):
  for i in range(8):
   x=-1.12+i*.32+(row%2)*.16
   if abs(x)<.78 and .30+row*.32<1.50:continue
   if abs(x)>1.20:continue
   cube('Wall facing stone',(x,-.87,.46+row*.32),(.28,.06,.24),'stoneLight' if (i+row)%3 else 'stoneBlue')

 # Arched cart entry with dressed jambs and voussoirs, doors swung inward.
 cube('Gateway',(0,-.78,.78),(.94,.30,.96),'dark')
 cyl('Gateway head',(0,-.78,1.26),.47,.30,'dark',16).rotation_euler.x=math.pi/2
 for x in [-.60,.60]:cube('Gate jamb',(x,-.90,.78),(.22,.16,.96),'stoneLight')
 for i in range(9):
  a=math.pi*i/8
  o=cube('Arch voussoir',(math.cos(a)*.60,-.90,1.26+math.sin(a)*.60),(.22,.16,.26),'stoneLight' if i%2 else 'stone')
  o.rotation_euler.y=math.pi/2-a
 for x in [-.38,.38]:
  cube('Gate door',(x,-.66,.74),(.18,.09,.88),'timber')
  cube('Gate door band',(x,-.72,1.02),(.20,.04,.09),'cut')
 cube('Stored crate',(-.24,-.44,.52),(.36,.34,.44),'cut')
 cyl('Stored cask',(.26,-.42,.50),.20,.50,'timber',10,.18)

 # Parapet walk and merlons, stepping either side of the gatehouse tower.
 cube('Parapet walk',(0,.12,2.00),(2.60,2.00,.14),'stoneLight')
 for y in [-.86,1.00]:
  for x in [-1.00,-.70,.70,1.00]:cube('Merlon',(x,y,2.24),(.22,.22,.34),'stoneLight')

 # Central gatehouse tower with a quoined shell, lit niche and amber cap.
 cube('Gatehouse tower',(0,.02,2.42),(1.18,1.40,1.04),'stoneLight')
 for x in [-.54,.54]:
  for y in [-.64,.68]:cube('Gatehouse quoin',(x,y,2.42),(.15,.15,1.04),'stone')
 cube('Niche surround',(0,-.75,2.42),(.48,.07,.54),'stone')
 cube('Gatehouse niche',(0,-.79,2.40),(.30,.05,.40),'dark')
 cyl('Niche head',(0,-.79,2.60),.15,.05,'dark',12).rotation_euler.x=math.pi/2
 roof(1.38,1.62,2.94,.86,'gold',.02)
 cyl('Ridge finial',(0,.02,3.92),.10,.28,'goldLight',8,0)

 # Round corner turrets: battered base, banded drum, corbel and conical cap.
 for x in [-1.22,1.22]:
  cyl('Turret base',(x,-.32,.46),.64,.44,'stone',12,.58)
  cyl('Turret drum',(x,-.32,1.42),.56,1.52,'stoneLight',12,.53)
  for z in [1.02,1.60]:cyl('Turret band',(x,-.32,z),.58,.10,'stone',12,.57)
  cyl('Turret corbel',(x,-.32,2.28),.68,.20,'stoneLight',12,.62)
  cyl('Turret roof',(x,-.32,2.94),.72,1.12,'gold',12,0)
  for z,r in [(2.58,.61),(2.88,.43),(3.16,.25)]:cyl('Turret tile band',(x,-.32,z),r,.07,'goldLight',12,r-.05)
  cube('Turret slit',(x,-.86,1.40),(.14,.10,.44),'dark')
  beam('Turret pole',(x,-.32,3.46),(x,-.32,3.96),.045,'wood')
  cube('Turret pennant',(x,-.70,3.80),(.07,.54,.22),'roof')
  ico('Pole finial',(x,-.32,4.00),(.06,.06,.07),'goldLight')

 # Steps up to the gate, and the stores the building is named for.
 cube('Gate step',(0,-1.12,.15),(1.40,.24,.30),'stoneLight')
 cube('Gate step',(0,-1.34,.09),(1.60,.24,.18),'stone')
 cube('Storehouse crate',(1.00,-1.30,.28),(.52,.46,.56),'cut')
 for z in [.12,.44]:cube('Crate band',(1.00,-1.54,z),(.55,.05,.06),'timber')
 cube('Storehouse crate',(1.04,-1.24,.76),(.42,.38,.40),'cut')
 for y in [-1.24,-1.60]:
  cyl('Storehouse cask',(-1.02,y,.32),.24,.64,'timber',10,.21)
  for z in [.14,.52]:cyl('Cask band',(-1.02,y,z),.25,.05,'stone',10,.22)
 for x,y,z,s in [(-1.48,-1.10,.24,.95),(-1.40,-1.44,.22,.85)]:
  sack=ico('Store sack',(x,y,z),(.26*s,.30*s,.24*s),'cream');sack.rotation_euler.z=(x+y)*.4
  cyl('Sack tie',(x,y,z+.24*s),.08*s,.13*s,'cut',6)
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
 # Redesigned from the reference art: a broad thatched farmhouse whose deep
 # gable carries a loft door and hoist beam, with a shadowed cart entry, an
 # open grain counter under a propped shutter, an external stone chimney and
 # a roof pennant. It still anchors player-planted grain plots. Front is -Y.
 cube('Stone footing',(0,0,.09),(3.10,2.62,.18),'stoneBlue')
 cube('Footing cap',(0,0,.21),(3.00,2.52,.06),'stoneLight')

 # A rubble dado carries the plaster upper wall on all four sides, so the
 # deep thatch overhang always lands on solid masonry instead of floating.
 cube('Farmhouse stone base',(0,.05,.52),(2.88,2.38,.60),'stoneLight')
 cube('Farmhouse plaster wall',(0,.05,1.23),(2.88,2.38,.82),'plaster')
 roof(3.34,2.80,1.64,1.38,'thatch',.05)

 # Oak framing: corner posts, a sill course along the dado line, and a head
 # beam that also serves as the lintel over both front openings.
 for x in [-1.40,1.40]:
  for y in [-1.16,1.26]:cube('Oak corner post',(x,y,.93),(.14,.14,1.42),'wood')
 for y in [-1.16,1.26]:
  cube('Wall sill beam',(0,y,.85),(2.90,.11,.13),'wood')
  cube('Wall head beam',(0,y,1.57),(2.90,.11,.13),'wood')
 for x in [-1.46,1.46]:
  cube('Side sill beam',(x,.05,.85),(.11,2.50,.13),'wood')
  cube('Side head beam',(x,.05,1.57),(.11,2.50,.13),'wood')
 cube('Front stud',(-.02,-1.16,1.23),(.11,.11,.82),'wood')

 # Left bay: the shadowed cart entry that anchors the reference silhouette.
 cube('Doorway',(-.68,-1.13,.86),(.86,.06,1.28),'dark')
 for x in [-1.16,-.20]:cube('Door jamb',(x,-1.16,.87),(.12,.12,1.30),'wood')
 cube('Doorstep',(-.68,-1.36,.12),(.92,.40,.24),'stoneLight')

 # Right bay: an open grain counter whose shutter is propped on two posts,
 # keeping the working side readable from the game camera.
 cube('Grain bay opening',(.78,-1.13,1.05),(1.14,.06,.90),'dark')
 for x in [.16,1.40]:cube('Bay jamb',(x,-1.16,1.05),(.12,.12,.92),'wood')
 cube('Bay counter',(.78,-1.28,.66),(1.36,.40,.12),'cut')
 for x in [.28,1.28]:cube('Counter leg',(x,-1.40,.32),(.10,.10,.64),'wood')
 for x in [.40,.84]:
  ico('Sack on counter',(x,-1.26,.84),(.17,.15,.16),'cream')
  cyl('Counter sack tie',(x,-1.26,1.00),.06,.11,'cut',6)
 cyl('Grain measure',(1.20,-1.30,.83),.14,.22,'timber',8)
 ico('Loose grain',(1.20,-1.30,.95),(.13,.13,.04),'wheatLight')
 shutter=cube('Bay shutter',(.78,-1.48,1.66),(1.42,.68,.07),'timber');shutter.rotation_euler.x=-.30
 for x in [.22,1.34]:cube('Shutter prop',(x,-1.76,.87),(.09,.09,1.74),'wood')

 # Gable: loft door, collar, king post and the projecting hoist beam that
 # lifts sacks to the granary floor.
 cube('Loft sill',(0,-1.43,1.66),(.80,.14,.10),'wood')
 cube('Loft opening',(0,-1.375,1.90),(.58,.05,.40),'dark')
 for x in [-.34,.34]:cube('Loft jamb',(x,-1.40,1.90),(.09,.09,.40),'timber')
 cube('Gable collar',(0,-1.39,2.20),(1.30,.10,.12),'wood')
 cube('Gable king post',(0,-1.39,2.73),(.12,.10,.42),'wood')
 for x in [-.50,.50]:beam('Gable brace',(x,-1.39,2.28),(x*.12,-1.39,2.72),.07,'timber')
 beam('Hoist beam',(0,-1.32,2.42),(0,-1.74,2.42),.09,'wood')
 beam('Hoist rope',(0,-1.70,2.38),(0,-1.70,1.94),.022,'cream')
 cyl('Hoisted sack tie',(0,-1.70,1.90),.07,.13,'cut',6)
 ico('Hoisted sack',(0,-1.70,1.70),(.19,.20,.20),'cream')

 # External stone chimney on the right flank. It corbels inward in three
 # masses and carries banded courses, so it reads as masonry rather than as a
 # bare slab, and it clears the ridge without dominating the silhouette.
 cube('Chimney base',(1.28,.70,.55),(.48,.90,.86),'stoneLight')
 cube('Chimney breast',(1.26,.70,1.30),(.42,.78,.68),'stoneLight')
 cube('Chimney stack',(1.24,.70,2.30),(.34,.40,1.36),'stoneLight')
 for z in [.38,.74]:cube('Chimney course',(1.28,.70,z),(.52,.94,.06),'stone')
 for z in [1.12,1.48]:cube('Chimney course',(1.26,.70,z),(.46,.82,.06),'stone')
 for z in [1.92,2.36,2.80]:cube('Chimney course',(1.24,.70,z),(.38,.44,.06),'stone')
 cube('Chimney cap',(1.24,.70,3.04),(.46,.52,.12),'stone')
 cube('Flue opening',(1.24,.70,3.11),(.26,.30,.02),'dark')

 # Pennant at the gable apex, echoing the banner in the reference.
 beam('Pennant pole',(0,-1.28,2.88),(0,-1.28,4.10),.05,'wood')
 cube('Pennant',(-.38,-1.28,3.90),(.70,.035,.20),'roof')
 cube('Pennant stripe',(-.38,-1.30,3.72),(.70,.03,.15),'cream')
 ico('Pole finial',(0,-1.28,4.14),(.07,.07,.08),'wheat')

 # Flank window, then the sacks, casks and sheaves that read the yard as a farm.
 cube('Side window frame',(-1.47,.62,1.20),(.07,.42,.50),'timber')
 cube('Side window',(-1.51,.62,1.20),(.03,.30,.38),'dark')
 for x,y,z,s in [(-1.44,-1.48,.24,1),(-1.50,-.98,.24,.92),(-1.46,-1.24,.70,.86)]:
  sack=ico('Grain sack',(x,y,z),(.26*s,.30*s,.23*s),'cream');sack.rotation_euler.z=(x+y)*.4
  cyl('Sack tie',(x,y,z+.23*s),.08*s,.13*s,'cut',6)
 for y in [-.35,.20]:
  cyl('Grain cask',(-1.68,y,.33),.24,.62,'timber',10,.21)
  for z in [.14,.52]:cyl('Cask band',(-1.68,y,z),.25,.05,'stone',10,.22)
 # Stooked sheaves flare toward their bound heads instead of tapering to a point.
 for y in [-.74,-.16]:
  sheaf=cyl('Wheat sheaf',(1.56,y,.40),.13,.78,'wheat',7,.26);sheaf.rotation_euler.y=-.16
  cyl('Sheaf tie',(1.55,y,.47),.225,.10,'timber',8)
  cyl('Sheaf heads',(1.48,y,.92),.28,.26,'wheatLight',7,.16)

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
 # Rebuilt from the reference art as a notched log cabin under a turf roof:
 # stacked round logs whose sawn ends show at every corner, an open working
 # front, a ridge pole with a red pennant, and the yard's saw buck, chopping
 # block and log stock outside. Front elevation is -Y.
 cube('Sill stones',(0,0,.09),(2.76,2.64,.18),'stone')
 cube('Sill cap',(0,0,.21),(2.60,2.48,.08),'stoneLight')
 cube('Cabin floor',(0,0,.28),(2.34,2.22,.06),'timber')
 cube('Cabin interior',(0,1.04,1.32),(2.24,.10,1.10),'dark')

 # A sawyer's bench and stacked boards read through the open bay.
 cube('Work bench',(.34,.30,.86),(1.30,.56,.10),'timber')
 for x in [-.18,.86]:
  for y in [.10,.50]:cube('Bench leg',(x,y,.60),(.10,.10,.52),'wood')
 for z in [.93,1.00,1.07]:cube('Sawn board',(.34,.34,z),(1.16,.44,.055),'cut')
 for row in range(2):
  for col in range(2-row):
   cube('Plank stack',(-.86+col*.34+row*.17,.52,.38+row*.16),(.30,.86,.14),'cut')
 # Side walls run the full depth; their sawn ends make the front corners.
 for x in [-1.18,1.18]:
  for z in [.40,.67,.94,1.21,1.48]:
   log=cyl('Wall log',(x,0,z),.145,2.62,'wood',8);log.rotation_euler.x=math.pi/2
   for y in [-1.31,1.31]:
    cap=cyl('Sawn end',(x,y,z),.125,.03,'cut',8);cap.rotation_euler.x=math.pi/2
 # Rear wall logs sit half a course higher, so the corners interlock.
 for z in [.53,.80,1.07,1.34,1.61]:
  log=cyl('Rear log',(0,1.18,z),.145,2.70,'wood',8);log.rotation_euler.y=math.pi/2
  for x in [-1.35,1.35]:
   cap=cyl('Sawn end',(x,1.18,z),.125,.03,'cut',8);cap.rotation_euler.y=math.pi/2
 # Two front courses make a working sill; the bay stays open above them.
 for z in [.53,.80]:
  log=cyl('Front log',(0,-1.18,z),.145,2.70,'wood',8);log.rotation_euler.y=math.pi/2
  for x in [-1.35,1.35]:
   cap=cyl('Sawn end',(x,-1.18,z),.125,.03,'cut',8);cap.rotation_euler.y=math.pi/2
 cube('Sill plank',(0,-1.18,.96),(2.62,.34,.09),'cut')
 lintel=cyl('Door lintel log',(0,-1.18,1.73),.15,2.72,'wood',8);lintel.rotation_euler.y=math.pi/2
 for x in [-1.36,1.36]:
  cap=cyl('Sawn end',(x,-1.18,1.73),.13,.03,'cut',8);cap.rotation_euler.y=math.pi/2

 # A shallow turf roof, its ridge running across the front like the reference.
 placed_roof(2.78,3.02,1.86,.62,'leaf',0,0,math.pi/2,.08)
 ridge=cyl('Ridge pole',(0,0,2.50),.12,3.10,'wood',8);ridge.rotation_euler.y=math.pi/2
 for x in [-1.55,1.55]:
  cap=cyl('Ridge end',(x,0,2.50),.10,.03,'cut',8);cap.rotation_euler.y=math.pi/2
 for x in [-1.06,-.36,.36,1.06]:
  for y in [-1.44,1.44]:
   rafter=cyl('Rafter tail',(x,y,1.82),.075,.42,'wood',6);rafter.rotation_euler.x=math.pi/2
   cap=cyl('Rafter end',(x,y*1.15,1.82),.065,.03,'cut',6);cap.rotation_euler.x=math.pi/2
 # Tufts of grass growing out of the turf, on both slopes.
 for x,y in [(-1.18,-.92),(-.62,-1.16),(.12,-.78),(.86,-1.12),(1.24,-.46),(-.92,.74),(-.18,1.08),(.68,.86),(1.18,.52)]:
  z=1.86+.62*(1-min(1,abs(y)/1.39))
  ico('Roof grass',(x,y,z+.05),(.19,.16,.08),'leafLight')
  ico('Roof grass',(x+.16,y+.10,z+.03),(.12,.11,.06),'leaf')

 # Red pennant at the right end of the ridge.
 beam('Flagpole',(1.16,0,2.34),(1.16,0,3.32),.05,'wood')
 cyl('Pole finial',(1.16,0,3.36),.075,.11,'wheat',8)
 cube('Pennant',(1.46,0,3.10),(.54,.03,.26),'roof')
 for z in [3.19,3.01]:cube('Pennant tail',(1.78,0,z),(.18,.03,.09),'roof')

 # Saw buck with a log ready for cutting, in front of the open bay.
 for x in [-1.06,-.46]:
  beam('Saw buck leg',(x,-1.54,.04),(x,-1.96,.70),.075,'timber')
  beam('Saw buck leg',(x,-1.96,.04),(x,-1.54,.70),.075,'timber')
 log=cyl('Log on the buck',(-.76,-1.75,.70),.18,1.08,'wood',8);log.rotation_euler.y=math.pi/2
 for x in [-1.30,-.22]:
  cap=cyl('Sawn end',(x,-1.75,.70),.155,.03,'cut',8);cap.rotation_euler.y=math.pi/2
 cube('Saw blade',(-.14,-1.75,.60),(.05,.44,.20),'stoneLight')
 cube('Saw handle',(-.14,-1.53,.60),(.07,.10,.22),'wood')
 for y in [-1.60,-1.90]:cube('Sawdust',(-.62,y,.03),(.30,.14,.035),'cut')

 # Chopping block with a buried axe, and split billets beside it.
 cyl('Chopping block',(1.02,-1.62,.28),.32,.56,'wood',10)
 cyl('Block top',(1.02,-1.62,.57),.30,.04,'cut',10)
 beam('Axe handle',(1.02,-1.62,.60),(1.30,-1.78,1.02),.055,'timber')
 head=cube('Axe head',(1.05,-1.64,.66),(.10,.24,.20),'stoneLight');head.rotation_euler.x=.5
 for x,y,z in [(1.48,-1.36,.12),(1.48,-1.36,.34),(1.52,-1.66,.12)]:
  billet=cyl('Split billet',(x,y,z),.11,.42,'wood',6);billet.rotation_euler.y=math.pi/2
  cyl('Billet end',(x+.22,y,z),.095,.03,'cut',6).rotation_euler.y=math.pi/2

 # Stacked log stock along the sunny side, the yard's working stockpile.
 for row,count in [(0,3),(1,2)]:
  for col in range(count):
   y=-.55+col*.62+row*.31;z=.15+row*.30
   log=cyl('Stacked log',(1.46,y,z),.15,1.02,'wood',8);log.rotation_euler.y=math.pi/2
   for x in [.95,1.97]:
    cap=cyl('Sawn end',(x,y,z),.13,.03,'cut',8);cap.rotation_euler.y=math.pi/2
 for y in [-.75,1.15]:cube('Stack chock',(1.46,y,.09),(1.10,.10,.18),'timber')

 # Rain barrel by the door.
 cyl('Rain barrel',(-1.52,-.68,.36),.29,.72,'timber',10,.26)
 for z in [.18,.54]:cyl('Barrel band',(-1.52,-.68,z),.305,.06,'dark',10,.275)
 cyl('Barrel water',(-1.52,-.68,.71),.24,.03,'water',10)
 cube('Bucket',(-1.20,-1.16,.14),(.28,.28,.28),'timber')
 beam('Bucket handle',(-1.34,-1.16,.30),(-1.06,-1.16,.30),.025,'dark')
def mine():
 # A log-built quarry lodge taken from the reference art: stacked wall logs
 # with crossed, freshly cut corner ends, a shallow log roof whose deep front
 # slope lands on porch posts, a canvas work tent alongside and a red pennant
 # on a tall pole. Dressed blocks, rubble and a cutting trestle carry the
 # stone trade, and a low outcrop behind stands in for the worked hillside.
 RIDGE=2.43;SLOPE=.48;FRONT=1.50;BACK=1.25;RY=.35;WX=.88;WF=-.45;WB=1.15
 cube('Quarry pad',(0,.30,.07),(2.46,2.30,.14),'stoneLight')
 cube('Lodge floor',(0,.35,.17),(2.06,1.82,.08),'soil')

 # Wall courses alternate axis so the corner ends cross and protrude. The
 # front courses stop either side of the doorway until they clear the lintel.
 for z in [.30,.56,.82,1.08,1.34,1.60,1.86]:
  for x in [-WX,WX]:
   cyl('Side wall log',(x,RY,z),.13,2.10,'timber').rotation_euler.x=math.pi/2
   cyl('Log end',(x,-.71,z),.115,.04,'cut',6).rotation_euler.x=math.pi/2
 for z in [.43,.69,.95,1.21,1.47,1.73,1.99]:
  cyl('Rear wall log',(0,WB,z),.13,2.10,'timber').rotation_euler.y=math.pi/2
  for x,length in ([(0,2.10)] if z>1.40 else [(-.70,.70),(.70,.70)]):
   cyl('Front wall log',(x,WF,z),.13,length,'timber').rotation_euler.y=math.pi/2
  for x in [-1.05,1.05]:
   for y in [WF,WB]:
    cyl('Log end',(x,y,z),.115,.04,'cut',6).rotation_euler.y=math.pi/2

 # The doorway is a real gap in the log courses rather than a dark decal.
 cube('Lodge doorway',(0,WF+.03,.65),(.72,.22,1.30),'dark')
 for x in [-.42,.42]:cube('Door post',(x,WF-.02,.68),(.14,.28,1.36),'cut')
 cube('Door lintel',(0,WF-.02,1.40),(1.00,.28,.15),'cut')

 # Gable logs carry straight on up from the side walls, closing the triangle
 # under the roof with the same log construction.
 for z in [2.06,2.24,2.38]:
  span=(RIDGE-z)/SLOPE*2
  if span>.25:
   for x in [-WX,WX]:cyl('Gable log',(x,RY,z),.10,span,'timber').rotation_euler.x=math.pi/2

 # Two decks form the shallow pitch; log courses and a ridge pole ride on top.
 pitch=math.atan(SLOPE)
 for side,reach in [(-1,FRONT),(1,BACK)]:
  run=reach*math.sqrt(1+SLOPE*SLOPE)
  deck=cube('Roof deck',(0,RY+side*reach/2,RIDGE-SLOPE*reach/2),(2.46,run,.12),'wood')
  deck.rotation_euler.x=pitch if side<0 else math.pi-pitch
  normal=Vector((0,side*SLOPE,1)).normalized()
  for i in range(4):
   t=.15+i*.24;y=RY+side*reach*(1-t);z=RIDGE-SLOPE*reach*(1-t)
   cyl('Roof log',(0,y+normal.y*.085,z+normal.z*.085),.075,2.46,'timber').rotation_euler.y=math.pi/2
 cyl('Ridge pole',(0,RY,RIDGE+.08),.12,2.62,'wood').rotation_euler.y=math.pi/2

 # The long front slope oversails the wall and lands on a pair of porch posts
 # standing in line with the side walls.
 top=RIDGE-SLOPE*abs(-1.05-RY)-.09
 for x in [-WX,WX]:cyl('Porch post',(x,-1.05,top/2),.11,top,'timber')
 cyl('Porch beam',(0,-1.05,top-.08),.085,1.86,'wood').rotation_euler.y=math.pi/2

 # Pennant pole, as in the reference, rising behind the roof on the right.
 beam('Pennant pole',(1.42,.60,0),(1.42,.60,3.30),.055,'wood')
 cube('Pennant',(1.66,.60,3.00),(.46,.035,.30),'roof')
 cube('Pennant tip',(1.93,.60,3.00),(.12,.035,.13),'roof')

 # Canvas work tent on the left: two cream sheets over an A-frame, open at
 # the front so the tool crate inside stays readable, and pegged down in front.
 for y in [-1.89,-.71]:
  for x in [-2.00,-1.16]:beam('Tent frame',(x,y,0),(-1.58,y,1.00),.07,'wood')
 cyl('Tent ridge',(-1.58,-1.30,1.03),.05,1.30,'wood').rotation_euler.x=math.pi/2
 for x,turn,nx in [(-1.79,-1.150,-1),(-1.37,-1.9916,1)]:
  cube('Tent canvas',(x,-1.30,.53),(1.10,1.12,.05),'cream').rotation_euler.y=turn
  for f in [.34,.68]:
   cyl('Tent batten',(-1.58+nx*.42*(1-f)+nx*.041,-1.30,.06+.94*f+.018),.035,1.16,'wood').rotation_euler.x=math.pi/2
 for z,w,h in [(.21,.53,.30),(.50,.30,.28),(.76,.10,.24)]:cube('Tent back',(-1.58,-.73,z),(w,.05,h),'cream')
 beam('Guy rope',(-1.58,-1.92,1.00),(-1.58,-2.04,.05),.02,'cut')
 cube('Tent peg',(-1.58,-2.05,.07),(.07,.10,.16),'wood')
 cube('Tool crate',(-1.58,-1.48,.22),(.34,.38,.44),'cut')
 for z in [.10,.34]:cube('Crate band',(-1.58,-1.68,z),(.37,.04,.05),'timber')

 # Dressed blocks, loose rubble and a cutting trestle with the mason's tools.
 cube('Cut block',(.46,-1.50,.20),(.54,.48,.40),'stoneLight')
 cube('Cut block',(.99,-1.44,.19),(.50,.44,.38),'stone')
 cube('Cut block',(.60,-1.46,.53),(.46,.42,.28),'stoneLight')
 ico('Quarry rubble',(1.50,-.90,.26),(.58,.48,.28),'stone')
 ico('Quarry rubble',(1.58,-1.24,.18),(.34,.30,.19),'stoneLight')
 cube('Trestle top',(-.55,-1.55,.62),(.94,.40,.10),'timber')
 for x in [-.93,-.17]:cube('Trestle leg',(x,-1.55,.31),(.10,.36,.62),'wood')
 cube('Block on trestle',(-.55,-1.55,.82),(.56,.34,.30),'stoneLight')
 cube('Stone chisel',(-.27,-1.65,.80),(.06,.06,.26),'stoneBlue')
 beam('Mallet handle',(-.85,-1.71,.72),(-.51,-1.77,.86),.05,'wood')
 cyl('Mallet head',(-.47,-1.78,.88),.11,.24,'timber').rotation_euler.y=math.pi/2
 beam('Pick handle',(1.08,-.30,.04),(.96,-.62,1.05),.05,'wood')
 cyl('Pick head',(.96,-.62,1.09),.055,.54,'stoneBlue').rotation_euler.x=math.pi/2

 # A low outcrop behind the lodge keeps the hillside the stone is cut from.
 ico('Quarry outcrop',(-1.30,1.46,.52),(.80,.52,.92),'stone')
 ico('Quarry outcrop',(.94,1.52,.44),(.72,.50,.78),'stoneBlue')
 ico('Quarry outcrop',(-.12,1.70,.28),(.50,.36,.50),'stoneLight')
def windmill():
 # Redesigned from the reference art: a tall, slender tower mill with a
 # battered rubble base, a plank-clad timber body on a railed stage, a shingled
 # gable cap, a latticed sail wheel across the front elevation, a side loading
 # door with hoist, a pennant at the eave and flour sacks at the foot.
 # Front is -Y; the sail wheel turns in the XZ plane.
 cyl('Mill footing',(0,0,.07),1.46,.14,'stone',8,1.40)
 cyl('Mill base core',(0,0,.62),1.28,1.00,'stoneLight',8,1.08)

 # Individual rubble blocks are laid in three battered courses, leaving a gap
 # at the front for the ground-floor doorway rather than burying it.
 for row in range(3):
  for i in range(10):
   a=(i+row%2*.5)*math.tau/10
   if math.sin(a)<-.80 and math.cos(a)>-.45:continue
   r=1.24-row*.06
   o=cube('Base masonry',(r*math.cos(a),r*math.sin(a),.24+row*.32),(.38,.24,.30),'stoneLight' if i%3 else 'stone')
   o.rotation_euler.z=a+math.pi/2
 cyl('Base cap',(0,0,1.16),1.20,.14,'stone',8,1.14)
 cube('Mill doorway',(0,-1.18,.62),(.70,.34,.96),'dark')
 for x in [-.44,.44]:cube('Door post',(x,-1.22,.64),(.13,.28,1.02),'cut')
 cube('Door lintel',(0,-1.22,1.20),(1.06,.30,.16),'wood')

 # The stage is the working platform the reference wraps around the mill.
 cube('Mill stage',(0,-.03,1.28),(2.34,2.24,.14),'cut')
 for x in [-1.08,1.08]:
  for y in [-1.00,.94]:cube('Stage post',(x,y,1.60),(.10,.10,.50),'wood')
  cube('Stage rail',(x,-.03,1.78),(.09,2.04,.09),'timber')
 cube('Stage rail',(0,-1.00,1.78),(2.10,.09,.09),'timber')

 # Plank-clad body: lapped courses ride proud of the walls on every side, and
 # the oak posts and head plate carry the cap, so nothing reads as floating.
 cube('Mill body',(0,-.03,2.18),(1.84,1.74,1.94),'cut')
 for z in [1.48,1.80,2.12,2.44,2.76,3.05]:cube('Plank course',(0,-.03,z),(1.90,1.80,.07),'timber')
 for x in [-.93,.93]:
  for y in [-.90,.84]:cube('Body corner post',(x,y,2.18),(.14,.14,1.94),'wood')
 cube('Body plate',(0,-.03,3.22),(2.00,1.90,.14),'wood')
 roof(2.20,2.08,3.29,.92,'timber',-.03)

 # Windshaft bearing block, shaft and nose, fixed through the front wall.
 cube('Windshaft bearing',(0,-.94,2.66),(.58,.26,.52),'wood')
 for x in [-.42,.42]:beam('Shaft brace',(x,-.88,2.22),(x*.42,-1.00,2.52),.07,'wood')
 cyl('Windshaft',(0,-1.28,2.66),.15,.70,'timber',8).rotation_euler.x=math.pi/2
 cyl('Windshaft nose',(0,-1.66,2.66),.24,.16,'wood',8,.12).rotation_euler.x=math.pi/2

 # Sails stay a separate named pivot whose children lie in the local XZ plane,
 # which is what Three spins on the imported node's local Z axis.
 bpy.ops.object.empty_add(location=(0,-1.49,2.66));pivot=bpy.context.object;pivot.name='Sails';bpy.context.view_layer.update()
 hub=Vector((0,-1.52,2.66))
 def attach(o):
  o.parent=pivot;o.matrix_parent_inverse=pivot.matrix_world.inverted();return o
 for a in [0,math.pi/2,math.pi,math.pi*1.5]:
  v=Vector((math.cos(a),0,math.sin(a)));p=Vector((-math.sin(a),0,math.cos(a)))
  attach(beam('Sail whip',hub+v*.20,hub+v*1.70,.08,'wood'))
  attach(beam('Sail rail',hub+v*.40+p*.46,hub+v*1.62+p*.46,.055,'timber'))
  for i in range(6):
   attach(beam('Sail slat',hub+v*(.46+i*.25),hub+v*(.46+i*.25)+p*.48,.05,'cut'))
  canvas=cube('Canvas sail',hub+v*.82+p*.23+Vector((0,-.055,0)),(.46,.05,.76),'cream')
  canvas.rotation_euler.y=math.pi/2-a;attach(canvas)
 cyl('Sail hub',(0,-1.54,2.66),.26,.20,'timber',8).rotation_euler.x=math.pi/2

 # Side loading door with the hoist beam that lifts sacks off the stage.
 cube('Loading door',(.96,.28,2.46),(.09,.66,.88),'dark')
 for y in [-.09,.65]:cube('Loading post',(.98,y,2.46),(.11,.13,.92),'timber')
 cube('Loading lintel',(.98,.28,2.98),(.11,.90,.16),'wood')
 beam('Hoist beam',(.45,.28,3.50),(1.58,.28,3.50),.09,'wood')
 beam('Hoist rope',(1.52,.28,3.46),(1.52,.28,3.04),.022,'cream')
 cyl('Hoisted sack tie',(1.52,.28,3.00),.07,.13,'cut',6)
 ico('Hoisted sack',(1.52,.28,2.80),(.19,.20,.20),'cream')
 cube('Mill window frame',(-.97,-.18,2.34),(.10,.44,.52),'timber')
 cube('Mill window',(-1.02,-.18,2.34),(.04,.32,.38),'dark')

 # Pennant at the right eave, echoing the banner in the reference.
 cube('Flag pole shoe',(1.06,-.55,3.32),(.24,.18,.30),'wood')
 beam('Flag pole',(1.13,-.55,3.20),(1.13,-.55,4.28),.055,'wood')
 cube('Mill pennant',(1.13,-.96,4.04),(.09,.74,.26),'roof')
 cube('Pennant stripe',(1.13,-.96,3.84),(.085,.74,.15),'cream')
 ico('Pole finial',(1.13,-.55,4.32),(.07,.07,.08),'wheat')

 # Flour sacks and a spare millstone mark the mill yard at ground level.
 for x,y,z,s in [(-1.36,-.60,.26,1),(-1.26,-.98,.24,.9),(-1.40,-.24,.72,.82)]:
  sack=ico('Flour sack',(x,y,z),(.26*s,.30*s,.24*s),'cream');sack.rotation_euler.z=(x+y)*.4
  cyl('Sack tie',(x,y,z+.24*s),.08*s,.13*s,'cut',6)
 cyl('Spare millstone',(1.18,-1.06,.42),.42,.16,'stoneLight',12).rotation_euler.x=math.pi/2
 cyl('Millstone eye',(1.18,-1.16,.42),.10,.06,'dark',8).rotation_euler.x=math.pi/2
def watchtower():
 # A round lookout tower from the reference art: a battered stone drum with a
 # rough block face and an arched door, a timbered lookout loft above a
 # corbel course, a railed gallery, a deep conical thatch cap and twin red
 # pennants. An external stair climbs the right flank to the upper door.
 SH=2.10;RB=.82;RT=.70                       # stone shaft height and radii
 def surface(z):return RB-(RB-RT)*min(z,SH)/SH
 cyl('Tower plinth',(0,0,.13),.92,.26,'stoneLight',8,.88)
 cyl('Tower shaft',(0,0,SH/2),RB,SH,'stone',8,RT)

 # Rough blocks break the drum up the way the reference masonry does. The
 # angles keep clear of the arched door and of the upper stair landing.
 for a,z,w,h,m in [(-.55,.42,.30,.22,'stoneLight'),(.85,.64,.26,.20,'stoneBlue'),
                   (2.20,.36,.32,.24,'stoneLight'),(3.45,.80,.28,.22,'stoneLight'),
                   (4.35,.52,.30,.20,'stoneBlue'),(5.35,.94,.26,.22,'stoneLight'),
                   (2.85,1.16,.30,.22,'stoneBlue'),(1.85,1.34,.28,.20,'stoneLight'),
                   (3.95,1.48,.30,.22,'stoneLight'),(2.35,1.88,.26,.20,'stoneBlue'),
                   (4.75,1.24,.28,.22,'stoneLight'),(1.35,1.72,.26,.20,'stoneBlue')]:
  r=surface(z);cube('Stone block',(math.cos(a)*r,math.sin(a)*r,z),(.10,w,h),m).rotation_euler.z=a

 # Arched door at the foot, with dressed jambs and voussoirs around the head.
 cube('Tower doorway',(0,-.76,.72),(.52,.18,.92),'dark')
 cyl('Door arch',(0,-.76,1.18),.26,.18,'dark',10).rotation_euler.x=math.pi/2
 for x in [-.35,.35]:cube('Door jamb',(x,-.78,.74),(.15,.18,.96),'stoneLight')
 for i in range(5):
  a=math.pi*(.13+i*.185)
  cube('Arch stone',(math.cos(a)*.31,-.79,1.18+math.sin(a)*.31),(.12,.16,.15),'stoneLight').rotation_euler.y=math.pi/2-a
 cube('Doorstep',(0,-1.02,.09),(.66,.34,.18),'stoneLight')
 for a,z in [(-1.57,1.68),(3.14,1.10),(0.45,.88)]:
  r=surface(z);cube('Arrow slit',(math.cos(a)*r,math.sin(a)*r,z),(.12,.14,.44),'dark').rotation_euler.z=a

 # Corbel course carries the timbered lookout loft over the stonework.
 cyl('Corbel course',(0,0,2.14),.80,.16,'stoneLight',8,.76)
 cyl('Tower loft',(0,0,2.60),.72,.92,'timber',8,.68)
 for i in range(8):
  a=i*math.pi/4+math.pi/8;r=.70
  cube('Loft batten',(math.cos(a)*r,math.sin(a)*r,2.60),(.07,.11,.92),'wood').rotation_euler.z=a
 for a in [-math.pi/2,math.pi,0]:
  cube('Lookout opening',(math.cos(a)*.66,math.sin(a)*.66,2.62),(.18,.40,.50),'dark').rotation_euler.z=a

 # Railed gallery on angled brackets, with four posts carrying the roof.
 for i in range(8):
  a=i*math.pi/4
  beam('Gallery bracket',(math.cos(a)*.62,math.sin(a)*.62,2.52),(math.cos(a)*.94,math.sin(a)*.94,3.04),.08,'wood')
 cyl('Gallery deck',(0,0,3.10),.96,.14,'timber',8)
 for i in range(8):
  a=i*math.pi/4;b=(i+1)*math.pi/4
  cube('Gallery post',(math.cos(a)*.86,math.sin(a)*.86,3.38),(.09,.09,.44),'wood').rotation_euler.z=a
  for z in [3.26,3.52]:
   beam('Gallery rail',(math.cos(a)*.86,math.sin(a)*.86,z),(math.cos(b)*.86,math.sin(b)*.86,z),.05,'timber')
  if i%2:cube('Roof post',(math.cos(a)*.82,math.sin(a)*.82,3.52),(.10,.10,.90),'wood').rotation_euler.z=a

 # Deep conical thatch cap, built up in overhanging straw courses.
 cyl('Thatch eave',(0,0,4.00),1.16,.22,'thatch',10,1.02)
 cyl('Thatch cone',(0,0,4.66),1.08,1.45,'thatch',10,.06)
 for i in range(20):
  a=i*math.pi/10
  beam('Straw rib',(math.cos(a)*.19,math.sin(a)*.19,5.24),(math.cos(a)*1.08,math.sin(a)*1.08,4.02),.045,'thatchLight')
 cyl('Thatch cap',(0,0,5.44),.12,.18,'thatchLight',8,.05)

 # Twin pennants, as in the reference, on a slim pole above the cap.
 beam('Tower flagpole',(0,0,5.28),(0,0,6.36),.045,'wood')
 for z,w in [(6.12,.48),(5.76,.40)]:
  cube('Tower pennant',(w/2+.03,0,z),(w,.03,.24),'roof')
  cube('Pennant tail',(w+.09,0,z),(.12,.03,.11),'roof')

 # External stair up the right flank to the upper door.
 for x in [.78,1.18]:beam('Stair stringer',(x,-1.52,.02),(x,-.30,1.70),.09,'wood')
 for i in range(8):
  t=(i+.5)/8;cube('Stair tread',(.98,-1.50+1.18*t,.12+1.56*t),(.46,.26,.08),'cut')
 cube('Stair landing',(.98,-.08,1.64),(.58,.58,.12),'timber')
 beam('Stair handrail',(1.22,-1.42,.76),(1.22,-.30,2.14),.055,'timber')
 for t in [.20,.60]:cube('Handrail post',(1.22,-1.50+1.18*t,.48+1.56*t),(.08,.08,.64),'wood')
 cube('Landing post',(1.22,-.30,1.98),(.08,.08,.56),'wood')
 cube('Landing post',(1.22,.16,1.98),(.08,.08,.56),'wood')
 beam('Landing rail',(1.22,-.32,2.18),(1.22,.18,2.18),.05,'timber')
 cube('Upper door',(.70,0,2.10),(.18,.42,.78),'dark')
 cube('Upper lintel',(.72,0,2.56),(.16,.58,.13),'cut')

 # A few loose stones settle the tower onto its patch of ground.
 ico('Footing stone',(-1.12,.62,.16),(.36,.30,.24),'stone')
 ico('Footing stone',(.42,1.18,.13),(.28,.24,.20),'stoneLight')
 ico('Footing stone',(-.78,-1.02,.11),(.24,.22,.17),'stoneBlue')
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
assets={'tree':tree,'rock':rock,'fence':fence,'house':house,'bakery':bakery,'inn':inn,'school':school,'vineyard':vineyard,'storehouse':storehouse,'well':well,'farm':farm,'grainfield':lambda:grainfield('ripe'),'grainfield_sown':lambda:grainfield('sown'),'grainfield_sprout':lambda:grainfield('sprout'),'grainfield_growing':lambda:grainfield('growing'),'grainfield_ripe':lambda:grainfield('ripe'),'lumberyard':lumberyard,'mine':mine,'windmill':windmill,'watchtower':watchtower,'townhall':townhall,'worker':worker}
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
