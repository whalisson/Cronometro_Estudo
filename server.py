import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import openai
from openai.error import RateLimitError, NotFoundError, OpenAIError
from dotenv import load_dotenv

# -------------------------------------------------------------------
# Carrega .env e configura chave + endpoint (forçando HTTPS)
# -------------------------------------------------------------------
load_dotenv()
openai.api_key  = os.getenv("OPENAI_API_KEY")
openai.api_base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")

# -------------------------------------------------------------------
# Modelo configurável via ENV (default para gpt-3.5-turbo)
# -------------------------------------------------------------------
MODEL = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route('/api/ai-tips', methods=['POST'])
def ai_tips():
    data    = request.get_json() or {}
    summary = (data.get('summary') or "").strip()

    if not summary:
        return jsonify({'error': 'summary é obrigatório'}), 400

    try:
        resp = openai.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "Você dá dicas para melhorar estudo."},
                {"role": "user",   "content": (
                    "Analise este resumo de sessões de estudo e sugira 3 dicas "
                    f"para aumentar o tempo diário:\n{summary}"
                )}
            ],
            temperature=0.5,
            max_tokens=100
        )
        tips = resp.choices[0].message.content.strip()
        return jsonify({'tips': tips}), 200

    except RateLimitError as e:
        # Extrai o Retry-After da resposta da OpenAI (em segundos)
        retry_after = None
        if hasattr(e, "http_headers") and e.http_headers:
            retry_after = e.http_headers.get("Retry-After")
        # Default para 10s se não vier o cabeçalho
        try:
            wait = int(retry_after)
        except (TypeError, ValueError):
            wait = 10

        response = jsonify({
            'error': 'Cota da API excedida. Tente novamente mais tarde ou ajuste seu plano.'
        })
        response.status_code = 429
        response.headers['Retry-After'] = str(wait)
        return response

    except NotFoundError:
        return jsonify({
            'error': (
                f"O modelo “{MODEL}” não existe ou você não tem acesso a ele. "
                "Verifique sua subscrição ou defina OPENAI_MODEL para um modelo disponível."
            )
        }), 400

    except OpenAIError as e:
        # Erros gerais da OpenAI (por exemplo, 500 interno)
        return jsonify({
            'error': 'Falha ao chamar a OpenAI: ' + str(e)
        }), 502

    except Exception:
        import traceback; traceback.print_exc()
        return jsonify({'error': 'Erro interno no servidor.'}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)
