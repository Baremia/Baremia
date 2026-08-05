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
    let body: LoginBody;

    try {
      body = (await request.json()) as LoginBody;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "La solicitud no contiene un JSON válido",
        },
        { status: 400 }
      );
    }

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

    const response = NextResponse.json(
      {
        ok: true,
        redirectTo: "/admin",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );

    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: createAdminSessionToken(),
      httpOnly: true,
      sameSite: "lax",
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
