import nodemailer from 'nodemailer';

const prerender = false;
const POST = async ({ request }) => {
  try {
    const data = await request.json();
    const { name, company, email, message } = data;
    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Nombre, email y mensaje son requeridos"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: parseInt("587"),
      secure: false,
      auth: {
        user: "yzensoftware@gmail.com",
        pass: "sbdx ymya bliy uvqs"
      }
    });
    const mailOptions = {
      from: `"Formulario Web Yzen Software" <${"yzensoftware@gmail.com"}>`,
      to: "yzensoftware@gmail.com",
      replyTo: email,
      subject: `Nueva consulta de ${name}${company ? ` - ${company}` : ""}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 12px;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #a5f3fc; margin: 0; font-size: 24px;">Nueva Consulta Web</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
              <p style="color: #64748b; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Nombre</p>
              <p style="color: #1e293b; margin: 0; font-size: 16px; font-weight: 600;">${name}</p>
            </div>
            
            ${company ? `
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
              <p style="color: #64748b; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Compañía</p>
              <p style="color: #1e293b; margin: 0; font-size: 16px; font-weight: 600;">${company}</p>
            </div>
            ` : ""}
            
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
              <p style="color: #64748b; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Email</p>
              <p style="color: #0891b2; margin: 0; font-size: 16px;">
                <a href="mailto:${email}" style="color: #0891b2; text-decoration: none;">${email}</a>
              </p>
            </div>
            
            <div>
              <p style="color: #64748b; margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Mensaje</p>
              <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; border-left: 4px solid #0891b2;">
                <p style="color: #334155; margin: 0; line-height: 1.6; white-space: pre-wrap;">${message}</p>
              </div>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              Este mensaje fue enviado desde el formulario de contacto de Yzen Software
            </p>
          </div>
        </div>
      `,
      text: `
Nueva consulta de: ${name}
${company ? `Compañía: ${company}` : ""}
Email: ${email}

Mensaje:
${message}
      `.trim()
    };
    await transporter.sendMail(mailOptions);
    return new Response(
      JSON.stringify({
        success: true,
        message: "Email enviado correctamente"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error enviando email:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Error al enviar el email. Por favor, intenta nuevamente."
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	POST,
	prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
