# Convenience targets (Unix-like shells). On Windows use `python run_all.py ...` instead.
PY ?= python

.PHONY: setup data models notebooks test build run prod check

setup:            ## install Python and frontend dependencies
	$(PY) -m pip install -r requirements.txt
	cd frontend && npm ci

data:             ## notebook 01: generate data/dataset.csv
	$(PY) scripts/build_notebook_01.py
	$(PY) scripts/run_notebook.py notebooks/01_generate_dataset.ipynb

models:           ## notebook 02: splits, EDA, pipelines, automata, metrics
	$(PY) scripts/build_notebook_02.py
	$(PY) scripts/run_notebook.py notebooks/02_eda_models_automata.ipynb

notebooks: data models

test:             ## pytest suite
	$(PY) -m pytest -q

build:            ## production build of the website
	cd frontend && npm run build

run:              ## API on :8000 + website dev server on :5173
	$(PY) run_all.py

prod:             ## build the website and serve everything from :8000
	$(PY) run_all.py --prod

check:            ## tests + typecheck + build + end-to-end browser test
	$(PY) run_all.py --check
