const express = require("express")
const Database = require("better-sqlite3")
const path = require("path")
const ExcelJS = require("exceljs")

const app = express()

const PORT = process.env.PORT || 3000
const API_KEY = process.env.API_KEY || "gps123securekey"

/* ===============================
   DATABASE
================================ */

const db = new Database("gps.db")

db.prepare(`
CREATE TABLE IF NOT EXISTS gps_data (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 received_on TEXT,
 server_time INTEGER,
 server_time_wib TEXT,
 device_time INTEGER,
 device_time_wib TEXT,
 lat REAL,
 lon REAL,
 speed INTEGER,
 heading REAL,
 satellites INTEGER,
 ax REAL,
 ay REAL,
 az REAL,
 event TEXT,
 data_type TEXT
)
`).run()

db.prepare(`
CREATE INDEX IF NOT EXISTS idx_device_time
ON gps_data(device_time)
`).run()

console.log("Database ready")

/* ===============================
   TIME
================================ */

function formatWIB(ms){
 const date = new Date(ms)
 return date.toLocaleString("sv-SE",{
  timeZone:"Asia/Jakarta"
 }).replace("T"," ")
}

function nowWIB(){
 return new Date().toLocaleString("sv-SE",{
  timeZone:"Asia/Jakarta"
 })
}

/* ===============================
   VALIDATION
================================ */

function validCoordinate(lat,lon){
 if(lat === 0 || lon === 0) return false
 if(lat < -90 || lat > 90) return false
 if(lon < -180 || lon > 180) return false
 return true
}

/* ===============================
   ROOT (WAJIB UNTUK SERVER PUBLIC)
================================ */

app.get("/", (req,res)=>{
 res.send("GPS TRACKER SERVER ONLINE")
})

/* ===============================
   GPS API
================================ */

app.get("/gps",(req,res)=>{

 try{

  if(req.query.key !== API_KEY)
   return res.json({status:"error",message:"invalid key"})

  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)

  if(isNaN(lat) || isNaN(lon))
   return res.json({status:"error",message:"invalid gps"})

  if(!validCoordinate(lat,lon))
   return res.json({status:"error",message:"invalid coordinate"})

  let speed = parseFloat(req.query.speed || 0)
  if(speed > 300 || speed < 6) speed = 0
  speed = Math.round(speed)

  let heading = parseFloat(req.query.heading || 0)
  if(heading < 0 || heading > 360) heading = 0

  let satellites = parseInt(req.query.sat || 0)
  if(satellites < 0 || satellites > 50) satellites = 0

  let ax = parseFloat(req.query.ax || 0)
  let ay = parseFloat(req.query.ay || 0)
  let az = parseFloat(req.query.az || 0)

  if(isNaN(ax)) ax = 0
  if(isNaN(ay)) ay = 0
  if(isNaN(az)) az = 0

  const event = req.query.event || "interval"

  const server_time = Date.now()
  const server_time_wib = formatWIB(server_time)

  let device_time = parseInt(req.query.device_time || 0)
  if(!device_time) device_time = server_time

  if(device_time > server_time + 5000){
   console.log("TIME DRIFT FUTURE → corrected")
   device_time = server_time
  }

  if(device_time < server_time - (24*60*60*1000)){
   console.log("TIME TOO OLD → corrected")
   device_time = server_time
  }

  const device_time_wib = formatWIB(device_time)
  const received_on = nowWIB()

  const data_type =
   req.query.buffered == 1 ? "buffer" : "realtime"

  db.prepare(`
   INSERT INTO gps_data (
    received_on,
    server_time,
    server_time_wib,
    device_time,
    device_time_wib,
    lat,
    lon,
    speed,
    heading,
    satellites,
    ax,
    ay,
    az,
    event,
    data_type
   )
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
   received_on,
   server_time,
   server_time_wib,
   device_time,
   device_time_wib,
   lat,
   lon,
   speed,
   heading,
   satellites,
   ax,
   ay,
   az,
   event,
   data_type
  )

  console.log("GPS:", lat, lon, "| speed:", speed)

  res.json({status:"ok"})

 }catch(e){

  console.log("ERROR:",e)

  res.json({
   status:"error",
   message:"server error"
  })

 }

})

/* ===============================
   DATA API
================================ */

app.get("/data",(req,res)=>{

 try{

  const limit = parseInt(req.query.limit || 500)

  const rows = db.prepare(`
   SELECT
   device_time_wib,
   lat,
   lon,
   speed,
   heading,
   satellites,
   event,
   data_type
   FROM gps_data
   ORDER BY device_time DESC
   LIMIT ?
  `).all(limit)

  res.json(rows)

 }catch(e){

  console.log("DATA ERROR:",e)
  res.json([])

 }

})

/* ===============================
   EXPORT
================================ */

app.get("/export", async (req,res)=>{

 try{

  const rows = db.prepare(`
   SELECT * FROM gps_data
  `).all()

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("GPS Data")

  sheet.columns = [
   {header:"Time",key:"device_time_wib",width:20},
   {header:"Lat",key:"lat",width:12},
   {header:"Lon",key:"lon",width:12},
   {header:"Speed",key:"speed",width:10},
   {header:"Heading",key:"heading",width:10},
   {header:"Sat",key:"satellites",width:10}
  ]

  rows.forEach(r=>sheet.addRow(r))

  res.setHeader(
   "Content-Type",
   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )

  res.setHeader(
   "Content-Disposition",
   'attachment; filename="gps.xlsx"'
  )

  await workbook.xlsx.write(res)
  res.end()

 }catch(e){

  console.log("EXPORT ERROR:",e)
  res.send("ERROR")

 }

})

/* ===============================
   STATIC FILE (WEB PLATFORM)
================================ */

app.use(express.static(path.join(__dirname,"public")))

/* ===============================
   START SERVER
================================ */

app.listen(PORT,()=>{

 console.log("=================================")
 console.log(" GPS SERVER RUNNING")
 console.log(" PORT     :", PORT)
 console.log("=================================")

})
