import type { APIRoute } from 'astro';

// This endpoint needs to run on the server at request time
export const prerender = false;

const EMAIL_API_URL = 'https://yzen-api-production.up.railway.app/api/send-email';

export const POST: APIRoute = async ({ request }) => {
	try {
		const data = await request.json();
		const { name, company, email, message } = data;

		// Validación básica
		if (!name || !email || !message) {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Nombre, email y mensaje son requeridos'
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Llamar a la API externa de email
		const response = await fetch(EMAIL_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				nombre: name,
				compania: company || undefined,
				email: email,
				mensaje: message,
			}),
		});

		const result = await response.json();

		if (!response.ok || !result.success) {
			console.error('Error from email API:', result);
			return new Response(
				JSON.stringify({
					success: false,
					error: result.message || 'Error al enviar el email'
				}),
				{ status: response.status, headers: { 'Content-Type': 'application/json' } }
			);
		}

		return new Response(
			JSON.stringify({
				success: true,
				message: 'Email enviado correctamente'
			}),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);

	} catch (error) {
		console.error('Error enviando email:', error);
		return new Response(
			JSON.stringify({
				success: false,
				error: 'Error al enviar el email. Por favor, intenta nuevamente.'
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
