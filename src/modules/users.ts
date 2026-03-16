import bcrypt from "bcrypt";
import { pool } from "../db";

function createHash(password: string) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(10));
}

export async function processUserFile(filePath: string) {

  const fileName = filePath.split("/").pop()!;

  const altaMatch = fileName.match(/^alta-(.+)-(\d+)\.csv$/);
  const bajaMatch = fileName.match(/^baja-(.+)-(\d+)\.csv$/);

  if (altaMatch) {

    const nombre = altaMatch[1];
    const dni = altaMatch[2];

    const email = `${nombre}@gmail.com`;
    const password = createHash(dni);

    await pool.query(
      `
      INSERT INTO users(name,email,dni,password,role,is_active)
      VALUES($1,$2,$3,$4,'user',true)
      ON CONFLICT(dni)
      DO UPDATE SET
        name=EXCLUDED.name,
        email=EXCLUDED.email,
        password=EXCLUDED.password,
        is_active=true
      `,
      [nombre,email,dni,password]
    );

  } else if (bajaMatch) {

    const dni = bajaMatch[2];

    await pool.query(
      `UPDATE users SET is_active=false WHERE dni=$1`,
      [dni]
    );

  } else {
    throw new Error("Formato user inválido");
  }
  }