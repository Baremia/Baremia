import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  isValidAdminPassword,
} from "../../../../lib/admin-auth";

type LoginBody = {
  password?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginBody;
    const password = body.password?.trim() ?? "";

    if (!password || !isValidAdminPassword(password)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Contraseña incorrecta",
        },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: createAdminSessionToken(),
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (error) {
    console.error("Error en /api/admin/login:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo iniciar la sesión de administración",
      },
      { status: 500 }
    );
  }
}
