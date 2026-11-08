# Inbox: government scam-number files

Drop CSV or JSON exports of the government scam-number list here. The pipeline's `fetch_gov` step lands
each file in `bronze.landed_file` exactly as it is (the same file twice is landed once). Files in this
folder are data, so git ignores them (only this README is committed).

The format is the data contract in [../README.md](../README.md#government-list-data-contract).

Want sample rows for a demo? Copy the synthetic sample (numbers taken from the demo scenarios):

```bash
cp pipeline/sample/gov_scam_numbers.sample.csv inbox/
docker compose run --rm pipeline
```
