with open('c:/Users/bharg/OneDrive/Documents/ztest/laminar/frontend/components/venues/prediction-graph.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('name="Upper Band"', 'name="Max Forecast"')
text = text.replace('name="Lower Band"', 'name="Min Forecast"')

with open('c:/Users/bharg/OneDrive/Documents/ztest/laminar/frontend/components/venues/prediction-graph.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
