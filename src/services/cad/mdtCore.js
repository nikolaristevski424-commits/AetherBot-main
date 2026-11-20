/** Guild-isolated, fictional ER:LC roleplay records and map calibration helpers.
 * Do not enter real-world personal data in this MDT.
 */
export const MDT_MAX_RECORDS = 500;
export const MDT_MAX_BOLOS = 250;
export const MDT_MAX_ANCHORS = 8;
export const MDT_MAP_SIZE = 5355;

function clean(value, limit = 120) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
function requireField(value, min, limit, name) {
  const result = clean(value, limit);
  if (result.length < min) throw new Error(`${name} must contain at least ${min} characters.`);
  return result;
}
export function normalizeMdtRecord(input) {
  if (input?.kind !== 'person' && input?.kind !== 'vehicle') throw new Error('Record type must be person or vehicle.');
  const kind = input.kind;
  const subject = requireField(input.subject, 2, 90, 'Roleplay character or vehicle name');
  const notes = clean(input.notes, 1200);
  const robloxUsername = clean(input.robloxUsername, 40);
  const plate = clean(input.plate, 16).toUpperCase();
  const description = clean(input.description, 240);
  if (kind === 'vehicle' && !plate) throw new Error('Vehicle records require an in-game license plate.');
  if (robloxUsername && !/^[A-Za-z0-9_]{3,40}$/.test(robloxUsername)) throw new Error('Invalid Roblox username.');
  if (plate && !/^[A-Z0-9 -]{2,16}$/.test(plate)) throw new Error('Plate should contain only letters, digits, spaces or dashes.');
  return { kind, subject, notes, robloxUsername: kind === 'person' ? robloxUsername : '', plate: kind === 'vehicle' ? plate : '', description };
}
export function normalizeMdtBolo(input, now = Date.now()) {
  const kind = input?.kind;
  if (!['person','vehicle'].includes(kind)) throw new Error('BOLO type must be person or vehicle.');
  const subject = requireField(input.subject, 2, 90, 'BOLO subject');
  const details = requireField(input.details, 8, 1000, 'BOLO details');
  const location = clean(input.location, 90);
  const priority = input.priority || 'normal';
  if (!['normal','urgent'].includes(priority)) throw new Error('BOLO priority is invalid.');
  const expiresInHours = Number(input.expiresInHours ?? 48);
  if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) throw new Error('BOLO expiry must be between 1 and 168 hours.');
  return { kind, subject, details, location, priority, expiresAt: now + expiresInHours * 3_600_000 };
}
export function isBoloActive(bolo, now = Date.now()) {
  return bolo?.status === 'active' && Number.isFinite(bolo.expiresAt) && bolo.expiresAt > now;
}
export function filterMdtRecords(records, query, limit = 60) {
  const q = clean(query, 100).toLowerCase();
  if (!q) return records.filter(x => x.status !== 'archived').slice(-limit).reverse();
  return records.filter(x => x.status !== 'archived' && [x.subject,x.robloxUsername,x.plate,x.description,x.notes].some(v=>String(v||'').toLowerCase().includes(q)))
    .slice(-limit).reverse();
}
export function resolveMdtReference(records, reference) {
  const q = clean(reference, 36).toLowerCase();
  if (!/^[0-9a-f-]{8,36}$/.test(q)) return null;
  const matches = records.filter(x=>x.id?.toLowerCase().startsWith(q));
  return matches.length === 1 ? matches[0] : null;
}
function solve3(A, y) {
  const rows = A.map((r,i)=>[...r,y[i]]);
  for(let col=0;col<3;col++) {
    let pivot=col;
    for(let row=col+1;row<3;row++) if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col])) pivot=row;
    if (Math.abs(rows[pivot][col]) < 1e-7) return null;
    [rows[col],rows[pivot]] = [rows[pivot],rows[col]];
    const scale=rows[col][col]; for(let k=col;k<=3;k++)rows[col][k]/=scale;
    for(let row=0;row<3;row++)if(row!==col){const mult=rows[row][col];for(let k=col;k<=3;k++)rows[row][k]-=mult*rows[col][k];}
  }
  return rows.map(r=>r[3]);
}
/** Least-squares affine X/Z -> image percent transform, >=3 noncollinear control points. */
export function fitMapCalibration(anchors) {
  if (!Array.isArray(anchors) || anchors.length<3 || anchors.length>MDT_MAX_ANCHORS) return null;
  const m=[[0,0,0],[0,0,0],[0,0,0]], rx=[0,0,0], ry=[0,0,0];
  for(const a of anchors){
    if (!Number.isFinite(a.worldX)||!Number.isFinite(a.worldZ)||!Number.isFinite(a.mapX)||!Number.isFinite(a.mapY))return null;
    const v=[a.worldX,a.worldZ,1];
    for(let i=0;i<3;i++){
      for(let j=0;j<3;j++) m[i][j]+=v[i]*v[j];
      rx[i]+=v[i]*a.mapX;ry[i]+=v[i]*a.mapY;
    }
  }
  const coeffX=solve3(m,rx),coeffY=solve3(m,ry);
  if(!coeffX||!coeffY)return null;
  const rms=Math.sqrt(anchors.reduce((sum,a)=>{
    const xp=coeffX[0]*a.worldX+coeffX[1]*a.worldZ+coeffX[2];
    const yp=coeffY[0]*a.worldX+coeffY[1]*a.worldZ+coeffY[2];
    return sum+(xp-a.mapX)**2+(yp-a.mapY)**2;
  },0)/anchors.length);
  return { coeffX,coeffY,rmsErrorPercent:rms };
}
export function validateMapAnchors(input){
  if(!Array.isArray(input)||input.length>MDT_MAX_ANCHORS) throw new Error(`Provide at most ${MDT_MAX_ANCHORS} map anchors.`);
  const anchors=input.map(a=>{
    const worldX=Number(a?.worldX),worldZ=Number(a?.worldZ),mapX=Number(a?.mapX),mapY=Number(a?.mapY);
    if(![worldX,worldZ,mapX,mapY].every(Number.isFinite)||Math.abs(worldX)>10000||Math.abs(worldZ)>10000||mapX<0||mapX>100||mapY<0||mapY>100)
      throw new Error('Calibration coordinates must be finite and within map limits.');
    return {worldX,worldZ,mapX,mapY,label:clean(a?.label,60)};
  });
  if(anchors.length>0 && anchors.length<3) return {anchors, transform:null};
  if(!anchors.length)return {anchors,transform:null};
  const transform=fitMapCalibration(anchors);
  if(!transform)throw new Error('Use at least three non-collinear in-game landmarks.');
  if(transform.rmsErrorPercent>6)throw new Error('The selected landmarks disagree by more than 6% of map width. Check their positions.');
  return {anchors,transform};
}
export function projectMdtPosition(x,z,transform=null){
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  const u=transform?.coeffX?.length===3?transform.coeffX[0]*x+transform.coeffX[1]*z+transform.coeffX[2]:(x+MDT_MAP_SIZE/2)/MDT_MAP_SIZE*100;
  const v=transform?.coeffY?.length===3?transform.coeffY[0]*x+transform.coeffY[1]*z+transform.coeffY[2]:(z+MDT_MAP_SIZE/2)/MDT_MAP_SIZE*100;
  return Number.isFinite(u)&&Number.isFinite(v)&&u>=0&&u<=100&&v>=0&&v<=100?{x:u,y:v}:null;
}
