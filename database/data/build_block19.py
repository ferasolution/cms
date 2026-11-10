import cv2, numpy as np, json, sys, math
img = cv2.imread(sys.argv[1]); P = json.load(open(sys.argv[2])); Z = json.load(open(sys.argv[3]))
# ---- upper (individual) plots: numbers read from the plan ----
manual = {124:143,127:135,129:134,131:125,135:124,137:117,140:116,143:109,144:108,146:101,139:100,136:102,132:107,130:110,126:115,123:118,120:123,118:126,116:133,109:136,
 125:99,121:103,119:106,117:111,110:114,106:119,101:122,99:127,94:132,89:137,112:98,104:104,100:105,98:112,91:113,85:120,82:121,75:128,54:66,49:129,66:131,59:138,71:142,62:144,
 38:141,31:145,35:130,28:139,13:140,10:146,150:46,149:54,147:63,148:47,145:55,141:64,142:48,138:56,133:65,134:49,128:57,122:66,
 68:81,70:78,73:75,74:72,76:69,77:68,78:51,79:43,37:82,40:79,42:76,44:73,48:70,50:61,52:52,53:44,14:83,15:80,16:77,17:74,18:71,19:62,20:53,21:45,2:84,3:50,5:58,6:59,
 32:88,33:85,11:89,12:86,0:90,1:87,23:93,25:92,8:94,9:91,4:96,7:95,
 107:22,108:18,111:4,114:1,113:8,115:11,102:149,103:154,105:155,84:36,86:33,87:30,88:27,90:23,92:19,93:5,97:2,95:9,96:12,80:150,81:153,83:156,
 61:28,63:24,64:20,65:6,67:3,69:10,72:13,55:41,56:39,57:37,58:34,60:31,41:16,43:15,45:14,46:157,47:152,51:151,22:42,24:40,26:38,27:35,29:32,30:29,34:25,36:21,39:17}
plots=[]
missing=[]
for i,p in enumerate(P):
    if p['kind']!='plot': continue
    if i not in manual: missing.append((i,p['cx'],p['cy'])); continue
    plots.append(dict(series='N', no=('66A' if i==54 else str(manual[i])), cx=p['cx'], cy=p['cy'], w=p['w'], h=p['h'], ang=p['ang']))
dup=[n for n in set(manual.values()) if list(manual.values()).count(n)>1]
print('upper plots', len(plots), 'unassigned', missing, 'dups', dup, file=sys.stderr)
# ---- grid cells: split merged, number serpentine ----
def region(p): return 'E' if p['cx']>840 else 'W'
for reg,start in (('E',101),('W',1)):
    cells=[p for p in P if p['kind']=='cell' and region(p)==reg]
    W=np.median([c['w'] for c in cells]); H=np.median([c['h'] for c in cells])
    angs=np.median([c['ang'] for c in cells])
    pieces=[]
    for c in cells:
        kw=max(1,round(c['w']/W)); kh=max(1,round(c['h']/H))
        a=math.radians(c['ang']); u=(math.cos(a),math.sin(a)); v=(-math.sin(a),math.cos(a))
        for i in range(kw):
            for j in range(kh):
                ou=(i-(kw-1)/2)*c['w']/kw; ov=(j-(kh-1)/2)*c['h']/kh
                pieces.append(dict(cx=c['cx']+u[0]*ou+v[0]*ov, cy=c['cy']+u[1]*ou+v[1]*ov, w=c['w']/kw, h=c['h']/kh, ang=c['ang']))
    a=math.radians(angs); u=(math.cos(a),math.sin(a)); v=(-math.sin(a),math.cos(a))
    for p in pieces: p['across']=p['cx']*u[0]+p['cy']*u[1]; p['along']=p['cx']*v[0]+p['cy']*v[1]
    pieces.sort(key=lambda p:p['across'])
    cols=[]; 
    for p in pieces:
        if cols and abs(p['across']-cols[-1][-1]['across'])<W*0.45: cols[-1].append(p)
        else: cols.append([p])
    def add(p, no): plots.append(dict(series=reg, no=str(no), cx=round(p['cx'],1), cy=round(p['cy'],1), w=round(p['w'],1), h=round(p['h'],1), ang=p['ang']))
    if reg=='E' and len(cols)==14:
        # pairs: (start, bottom-left, bottom-right, end) read from the plan; extra cells get A/B/C suffixes
        pairs=[(101,108,109,116),(117,124,125,133),(134,142,143,152),(153,162,163,172),(173,182,183,192),(193,203,204,214),(215,225,226,236)]
        for k,(s0,bl,br,e) in enumerate(pairs):
            L=sorted(cols[2*k], key=lambda p:p['along']); R=sorted(cols[2*k+1], key=lambda p:p['along'])
            for i,p in enumerate(L): add(p, s0+i if s0+i<=bl else f"{bl}{'ABC'[min(2,s0+i-bl-1)]}")
            extra=len(R)-(e-br+1)
            for i,p in enumerate(R):  # top -> bottom: e, e-1 ... br, then br suffixes
                no = e-i
                add(p, no if no>=br else f"{br}{'ABC'[min(2,br-no-1)]}")
        n=None
    else:
        n=start
        for ci,col in enumerate(cols):
            col.sort(key=lambda p:p['along'], reverse=(ci%2==1))
            for p in col: add(p, n); n+=1
    print(reg,'cells',len(cells),'pieces',len(pieces),'cols',[len(c) for c in cols], file=sys.stderr)
# ---- zones ----
def pick(k, cond): return [z['pts'] for z in Z[k] if cond(z['bbox'])]
boundary=[(596,23),(675,25),(845,231),(1100,129),(1129,169),(1276,96),(1313,576),(989,602),(985,556),(861,570),(834,548),(709,628),(692,649),(683,642),(540,736),(514,736),(405,564),(385,513),(372,427),(342,369),(304,316),(364,286),(349,247),(395,231),(375,180),(353,185),(331,132)]
g = (cv2.inRange(img,(158,146,146),(168,156,156)))
g = cv2.morphologyEx(g, cv2.MORPH_CLOSE, np.ones((5,5),np.uint8))
cn,_=cv2.findContours(g, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
grave=max(cn,key=cv2.contourArea); grave=cv2.approxPolyDP(grave,3,True)[:,0,:].tolist()
zones=[
 dict(type='park', label='Park', pts=pick('green', lambda b: b[0]==713)[0]),
 dict(type='park', label='Park', pts=pick('green', lambda b: b[0]==640)[0]),
 dict(type='mosque', label='Mosque', pts=pick('magenta', lambda b: b[0]==453)[0]),
 dict(type='commercial', label='Shopping Complex', pts=pick('red', lambda b: b[0]==744)[0]),
 dict(type='amenity', label='Amenity Plot', pts=pick('yellow', lambda b: b[0]==797)[0]),
 dict(type='office', label='Office', pts=[(855,244),(882,243),(883,257),(856,258)]),
 dict(type='outside', label='Graveyard', pts=grave, tone='graveyard'),
 dict(type='outside', label='Hina Bungalows', pts=pick('yellow', lambda b: b[0]==693)[0]),
 dict(type='outside', label='Gulshan Bungalows', pts=pick('yellow', lambda b: b[0]==1066)[0]),
 dict(type='outside', label='FL Mun Fountains', pts=pick('yellow', lambda b: b[0]==434)[0]),
 dict(type='outside', label='Apartments', pts=pick('yellow', lambda b: b[0]==347)[0]),
 dict(type='outside', label='Gulshan Complex', pts=pick('yellow', lambda b: b[0]==154)[0]),
 dict(type='outside_commercial', label='Habib Bank', pts=pick('red', lambda b: b[0]==296)[0]),
]
labels=[
 dict(text='MAIN ROAD 80\' WIDE', x=765, y=385, ang=-17, size='l'), dict(text='PARK AVENUE 60\'', x=775, y=226, ang=-4, size='m'),
 dict(text='RASHID MINHAS ROAD', x=360, y=395, ang=62, size='l', outside=True), dict(text='National Stadium Road', x=200, y=420, ang=8, size='m', outside=True),
]
gate=dict(x=405, y=470, ang=-20, label='Main Gate · Rashid Minhas Rd')
site=dict(name='Gulistan-e-Jauhar Block 19', source_px=[1635,737], scale_m_per_px=0.87, boundary=boundary, zones=zones, labels=labels, gate=gate,
          series={'N':'North (Bungalows)','E':'East','W':'West'})
json.dump(dict(site=site, plots=plots), open(sys.argv[4],'w'), separators=(',',':'))
print('total plots', len(plots), file=sys.stderr)
