import asyncio
import sys
import os

# Ensure app is in path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.prediction_service import PredictionService

async def test_prediction():
    ps = PredictionService()
    
    y_values = []
    base = 10.0
    for i in range(20):
        y_values.append(base + i*2)
    for i in range(10):
        y_values.append(y_values[-1] + 15)
        
    print(f"Data length: {len(y_values)}")
    print("Running _sklearn_forecast...")
    pred, curve = ps._sklearn_forecast(y_values, 15)
    print("Peak Pred:", pred)
    print("Curve:", curve)

if __name__ == "__main__":
    asyncio.run(test_prediction())
