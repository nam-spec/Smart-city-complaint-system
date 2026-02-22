from flask import Flask, request, jsonify
import joblib

app = Flask(__name__)

# Load trained model and vectorizer
model = joblib.load("model/model.pkl")
vectorizer = joblib.load("model/vectorizer.pkl")

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.json
        text = data.get("text")

        if not text:
            return jsonify({"error": "Text is required"}), 400

        X = vectorizer.transform([text])
        prediction = model.predict(X)[0]

        return jsonify({
            "category": prediction
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5001)