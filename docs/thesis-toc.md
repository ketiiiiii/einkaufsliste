# Proffix Forecast AI Engine — Master Thesis

## Vorgezogenes Inhaltsverzeichnis

> Status: Entwurf v1 (2026-04-02)
> Autor: Benjamin Steck, MAS Data Science, BFH

---

### 1 Einleitung
- 1.1 Ausgangslage
- 1.2 Problemstellung
- 1.3 Zielsetzung
- 1.4 Abgrenzung
- 1.5 Aufbau der Arbeit

### 2 Stand der Wissenschaft
- 2.1 Grundlagen der Zeitreihenprognose
  - 2.1.1 Begriffe und Definitionen
  - 2.1.2 Saisonalität, Trend, Zyklen
- 2.2 Statistische Forecasting-Methoden
  - 2.2.1 ARIMA / SARIMA
  - 2.2.2 Exponentielle Glättung (ETS)
  - 2.2.3 Prophet
- 2.3 Machine-Learning-Ansätze für Zeitreihen
  - 2.3.1 Gradient Boosting (XGBoost, LightGBM)
  - 2.3.2 Feature Engineering für tabellarische Zeitreihen
- 2.4 Deep-Learning-Modelle
  - 2.4.1 LSTM / GRU
  - 2.4.2 N-BEATS / N-HiTS
  - 2.4.3 Temporal Fusion Transformer (TFT)
- 2.5 Foundation Models für Zeitreihen
  - 2.5.1 TimesFM
  - 2.5.2 Chronos
  - 2.5.3 Lag-Llama
- 2.6 Bewertungskriterien und Modell-Shortlist

### 3 Stand der Technik
- 3.1 Proffix ERP-System und Datenstrukturen
  - 3.1.1 Bewegungsdatentabelle (Artikelnr., Menge, Metadaten)
  - 3.1.2 MS-SQL-Anbindung und Datenextraktion
- 3.2 Wato Doccrator als Middleware
  - 3.2.1 Rolle im Data-Flow (Proffix → CSV → Modell → SQL)
- 3.3 Experiment-Tracking mit MLflow
  - 3.3.1 Überblick Tracking-Tools (MLflow, W&B, Neptune)
  - 3.3.2 Begründung der Toolwahl
  - 3.3.3 MLflow-Konzepte: Runs, Experiments, Model Registry
- 3.4 NVIDIA DGX Spark als Trainingsinfrastruktur
- 3.5 Bestehende Forecast-Lösungen im ERP-Umfeld
  - 3.5.1 Marktüberblick
  - 3.5.2 Identifizierte Lücke im Proffix-Ökosystem

### 4 Methodik und Architektur
- 4.1 Vorgehensmodell (iterativ, phasenbasiert)
- 4.2 Architektur-Übersicht
  - 4.2.1 Schichtenmodell (Connector → Preprocessing → Features → Model → Prediction)
  - 4.2.2 Model-Interface-Design
- 4.3 Connector-Schicht und Standardschema
- 4.4 Preprocessing und Validierung
- 4.5 Feature-Builder-Schicht
- 4.6 Train/Validation/Test-Split-Strategie
- 4.7 MLflow-Integration und Logging-Struktur
- 4.8 Bewertungsmetriken (MAE, RMSE, MAPE)

### 5 Implementierung V1 — Klassische Modelle
- 5.1 Naive Baseline (Last Value, Mean)
- 5.2 Modell 1: Integration und Konfiguration
- 5.3 Train-, Eval- und Predict-Pipeline
- 5.4 Feature Engineering
  - 5.4.1 Lag-Features
  - 5.4.2 Rolling Statistics
  - 5.4.3 Kalenderfeatures
  - 5.4.4 Trend- und Saisonalitäts-Dekompositionen
- 5.5 Feature Importance und Reduktion
- 5.6 Split-Anpassung (Walk-Forward / Expanding Window)
- 5.7 Iterationsergebnisse und MLflow-Runs
- 5.8 Zwischenfazit V1

### 6 Implementierung V2 — Deep Learning
- 6.1 Modellauswahl (Begründung aus Kapitel 2)
- 6.2 Integration via Model-Interface
- 6.3 Training und MLflow-Tracking
- 6.4 Vergleich: Baseline vs. V1 vs. V2
- 6.5 Exogene Variablen (optional)
- 6.6 Fehleranalyse und Stärken-/Schwächenprofil
- 6.7 Zwischenfazit V2

### 7 Evaluation und Modellvergleich
- 7.1 Champion-Modell-Bestimmung
- 7.2 Finale Backtests auf Test-Set
- 7.3 Forecast-vs-Actual-Analyse
- 7.4 Konsolidierung aller MLflow-Runs
- 7.5 Diskussion der Ergebnisse

### 8 SQL-Deployment und Praxistest
- 8.1 Data-Flow: Proffix → Wato Doccrator → CSV → Modell → Forecast → MS-SQL
- 8.2 Model-Registry und Deployment-Konzept
- 8.3 Praxistest mit Proffix-Kunde
  - 8.3.1 Testaufbau und Durchführung
  - 8.3.2 Feedback und Akzeptanzbewertung

### 9 Handlungsempfehlung für Watosoft AG
- 9.1 Skalierbarkeit auf weitere Proffix-Kunden
- 9.2 Empfohlene nächste Schritte
- 9.3 Wirtschaftliche Einordnung

### 10 Fazit und Ausblick
- 10.1 Zusammenfassung der Ergebnisse
- 10.2 Zielerreichung
- 10.3 Limitationen
- 10.4 Ausblick (weitere Modelle, Proffix REST API, Automatisierung)

---

### Verzeichnisse
- Abbildungsverzeichnis
- Tabellenverzeichnis
- Abkürzungsverzeichnis
- Literaturverzeichnis

### Anhang
- A: MLflow-Screenshots und Experiment-Übersichten
- B: Code-Referenzen und Repository-Struktur
- C: Datenstruktur Proffix Bewegungsdaten
- D: Selbständigkeitserklärung
