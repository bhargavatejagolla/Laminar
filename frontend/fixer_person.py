import re

f = "app/person-wait-monitoring/page.tsx"

with open(f, 'r', encoding='utf-8') as file:
    content = file.read()

# Fix Downbar
content = re.sub(
    r'(function Downbar\([^)]*\)\s*\{)',
    r'\1\n  const { t } = useTranslation();',
    content
)

# Fix HealthGauge
content = re.sub(
    r'(function HealthGauge\([^)]*\)\s*\{)',
    r'\1\n  const { t } = useTranslation();',
    content
)

# Fix generateInsights
content = re.sub(
    r'function generateInsights\(metrics: QueueMetrics \| null, stats: LiveStats \| null\)',
    r'function generateInsights(metrics: QueueMetrics | null, stats: LiveStats | null, t: any)',
    content
)

# Fix SmartInsightsPanel
content = re.sub(
    r'(function SmartInsightsPanel\([^)]*\)\s*\{)',
    r'\1\n  const { t } = useTranslation();',
    content
)
# And its call to generateInsights
content = re.sub(
    r'const insights = generateInsights\(metrics, stats\);',
    r'const insights = generateInsights(metrics, stats, t);',
    content
)

# Fix EvidenceCard
content = re.sub(
    r'(function EvidenceCard\([^)]*\)\s*\{)',
    r'\1\n  const { t } = useTranslation();',
    content
)

# Fix CapacityMap
content = re.sub(
    r'(function CapacityMap\([^)]*\)\s*\{)',
    r'\1\n  const { t } = useTranslation();',
    content
)

with open(f, 'w', encoding='utf-8') as file:
    file.write(content)

print("Fixed person-wait-monitoring")
