import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // 1. Fix FIR-No.71062026-LIL-PS.pdf date
  await pool.query(`
    UPDATE "DocumentMetadata"
    SET "firDate" = '2026-06-24', "firNumber" = '71(06)2026 LIL-PS'
    WHERE "fileId" = (SELECT id FROM "File" WHERE name = 'FIR-No.71062026-LIL-PS.pdf')
  `);
  console.log('Fixed 71062026 date');

  const toInsert = [
    {
      name: 'FIR-No.-112026-CDL-PS.pdf',
      firNumber: '1(1)2026 CDL-PS',
      firDate: '2026-01-07',
      district: 'Chandel',
      policeStation: 'CDL-PS',
      actsAndSections: ['28/29 ND&PS ACT', '340 BNS'],
    },
    {
      name: 'FIR-No.-212026-CDL-PS.pdf',
      firNumber: '2(1)2026 CDL-PS',
      firDate: '2026-01-15',
      district: 'Chandel',
      policeStation: 'CDL-PS',
      actsAndSections: ['28/29 ND&PS ACT', '105 BNS'],
    },
    {
      name: 'FIR-NO.-3952026-CITY-PS.pdf',
      firNumber: '39(5)2026 City-PS',
      firDate: '2026-05-16',
      district: 'Imphal West',
      policeStation: 'City Police Station',
      actsAndSections: ['352 BNS', '356 BNS', '66C IT Act', '66D IT Act'],
    },
    {
      name: 'FIR-No.112092026-LIL-PS.pdf',
      firNumber: '112(09)2026 LIL-PS',
      firDate: '2026-09-09',
      district: 'Thoubal',
      policeStation: 'Lilong',
      propertyLoss: 120000,
      actsAndSections: ['305(a) BNS', '3(5) BNS'],
    },
  ];

  for (const item of toInsert) {
    const fileRes = await pool.query('SELECT id FROM "File" WHERE name = $1', [item.name]);
    if (fileRes.rows.length > 0) {
      const fileId = fileRes.rows[0].id;
      const id = 'meta-' + fileId.slice(0, 20);
      await pool.query(
        `INSERT INTO "DocumentMetadata" (id, "fileId", "firNumber", "firDate", district, "policeStation", "propertyLoss", "actsAndSections")
         VALUES ($1, $2, $3, $4::timestamp, $5, $6, $7, $8::json)
         ON CONFLICT ("fileId") DO UPDATE
         SET "firNumber" = EXCLUDED."firNumber",
             "firDate" = EXCLUDED."firDate",
             district = EXCLUDED.district,
             "policeStation" = EXCLUDED."policeStation",
             "propertyLoss" = EXCLUDED."propertyLoss",
             "actsAndSections" = EXCLUDED."actsAndSections"`,
        [id, fileId, item.firNumber, item.firDate, item.district, item.policeStation, item.propertyLoss || null, JSON.stringify(item.actsAndSections)]
      );
      console.log('Inserted/updated metadata for:', item.name);
    }
  }

  await pool.end();
}

main().catch(console.error);

