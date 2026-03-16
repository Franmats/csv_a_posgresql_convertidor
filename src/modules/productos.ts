import fs from "fs";
import { pool } from "../db";
import { from as copyFrom } from "pg-copy-streams";
import { pipeline } from "stream/promises";
import iconv from "iconv-lite";

function validateColumns(line: string, expected: number) {
  const parts = line.split(",").map(p => p.trim());
  if (parts.length !== expected) {
    throw new Error(
      `Cantidad de columnas inválida. Esperadas: ${expected}, recibidas: ${parts.length}`
    );
  }
}

// =========================
// CARGA MASIVA (BULK)
// =========================

export async function bulkArticulos(filePath: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Crear tabla temporal
    await client.query(`
      CREATE TEMP TABLE tmp_productos (
        codigo TEXT,
        nombre TEXT,
        codigo_barras TEXT,
        precio NUMERIC,
        stock INTEGER,
        precio_descuento NUMERIC,
        imagen TEXT,
        descripcion TEXT
      ) ON COMMIT DROP
    `);

    // 2️⃣ COPY a tabla temporal
    const copyStream = client.query(
      copyFrom(`
        COPY tmp_productos(codigo, nombre, codigo_barras, precio, stock, precio_descuento, imagen, descripcion)
        FROM STDIN WITH (FORMAT csv, HEADER true)
      `)
    );

    // Conversión de Windows-1252 (Visual FoxPro) a UTF-8
    const fileStream = fs.createReadStream(filePath);
    const convertStream = fileStream
      .pipe(iconv.decodeStream("win1252"))
      .pipe(iconv.encodeStream("utf8"));

    await pipeline(convertStream, copyStream);

    // 3️⃣ Upsert masivo — productos presentes en el CSV se activan
    await client.query(`
      INSERT INTO productoscsvtienda (codigo, nombre, codigo_barras, precio, stock, precio_descuento, imagen, descripcion, activo)
      SELECT DISTINCT ON (codigo)
        codigo, nombre, codigo_barras, precio, stock, precio_descuento, imagen, descripcion, TRUE
      FROM tmp_productos
      ORDER BY codigo
      ON CONFLICT (codigo)
      DO UPDATE SET
        nombre = EXCLUDED.nombre,
        codigo_barras = EXCLUDED.codigo_barras,
        precio = EXCLUDED.precio,
        stock = EXCLUDED.stock,
        precio_descuento = EXCLUDED.precio_descuento,
        imagen = EXCLUDED.imagen,
        descripcion = EXCLUDED.descripcion,
        activo = TRUE,
        updated_at = NOW()
    `);

    // 4️⃣ Desactivar productos que ya no están en el CSV
    await client.query(`
      UPDATE productoscsvtienda
      SET activo = FALSE, updated_at = NOW()
      WHERE codigo NOT IN (SELECT codigo FROM tmp_productos)
      AND activo = TRUE
    `);

    await client.query("COMMIT");

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// =========================
// UPSERT INDIVIDUAL
// =========================

export async function processProductoFile(filePath: string) {
  const fileName = filePath.split("/").pop()!;
  const match = fileName.match(/^update_(.+)_(\d{6})\.csv$/);

  if (!match) throw new Error("Formato inválido");

  const codigo = match[1];

  const content = fs.readFileSync(filePath, "utf8").trim();
  validateColumns(content, 7);

  const [nombre, codigo_barras, precio, stock, precio_descuento, imagen, descripcion] = content
    .split(",")
    .map(v => v.trim());

  await pool.query(
    `
    INSERT INTO productoscsvtienda(codigo, nombre, codigo_barras, precio, stock, precio_descuento, imagen, descripcion, activo)
    VALUES($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
    ON CONFLICT (codigo)
    DO UPDATE SET
      nombre = EXCLUDED.nombre,
      codigo_barras = EXCLUDED.codigo_barras,
      precio = EXCLUDED.precio,
      stock = EXCLUDED.stock,
      precio_descuento = EXCLUDED.precio_descuento,
      imagen = EXCLUDED.imagen,
      descripcion = EXCLUDED.descripcion,
      activo = TRUE,
      updated_at = NOW()
    `,
    [codigo, nombre, codigo_barras, precio, stock, precio_descuento, imagen, descripcion]
  );
}

// =========================
// DELETE
// =========================

export async function deleteProducto(filePath: string) {
  const fileName = filePath.split("/").pop()!;
  const match = fileName.match(/^delete_(.+)\.csv$/);

  if (!match) throw new Error("Formato inválido");

  const codigo = match[1];

  await pool.query(
    `UPDATE productoscsvtienda SET activo = FALSE, updated_at = NOW() WHERE codigo = $1`,
    [codigo]
  );
}