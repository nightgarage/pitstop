import io
import json
import zipfile
from datetime import datetime

from pitstop.importer import parse_bool, parse_csv, parse_date, parse_number, suggest_mapping

from .conftest import do_setup


# ---- pure parsing helpers ----

def test_parse_number_formats():
    assert parse_number("3.29") == 3.29
    assert parse_number("$3.29") == 3.29
    assert parse_number("1,234.56") == 1234.56
    assert parse_number("3,29") == 3.29  # decimal comma
    assert parse_number("1,234") == 1234
    assert parse_number("12.4 gal") == 12.4
    assert parse_number("") is None
    assert parse_number("n/a") is None


def test_parse_date_formats():
    assert parse_date("2026-07-01") == datetime(2026, 7, 1)
    assert parse_date("7/1/2026") == datetime(2026, 7, 1)
    assert parse_date("07/01/26") == datetime(2026, 7, 1)
    assert parse_date("2026-07-01T08:30:00") == datetime(2026, 7, 1, 8, 30)
    assert parse_date("Jul 1, 2026") == datetime(2026, 7, 1)
    assert parse_date("01.07.2026") == datetime(2026, 7, 1)
    assert parse_date("nonsense") is None


def test_parse_bool():
    assert parse_bool("Yes") and parse_bool("1") and parse_bool("x") and parse_bool("TRUE")
    assert not parse_bool("") and not parse_bool("no") and not parse_bool("0")


def test_parse_csv_sniffs_semicolons():
    headers, rows = parse_csv("date;odometer;volume\n2026-01-01;1000;10\n")
    assert headers == ["date", "odometer", "volume"]
    assert rows[0]["odometer"] == "1000"


def test_suggest_mapping_common_export_layout():
    # a layout many fuel trackers use in their CSV exports
    headers = [
        "MPG", "Miles", "Gallons", "Price", "Date", "Fuel Brand",
        "Octane", "Location", "Partial Fill-Up", "Missed Fill-Up", "Note", "Tags",
    ]
    mapping = suggest_mapping(headers, "fuelups")
    assert mapping["Date"] == "date"
    assert mapping["Miles"] == "odometer"
    assert mapping["Gallons"] == "volume"
    assert mapping["Price"] == "price_per_unit"
    assert mapping["Octane"] == "fuel_grade"
    assert mapping["Fuel Brand"] == "station"
    assert mapping["Partial Fill-Up"] == "partial_flag"
    assert mapping["Missed Fill-Up"] == "missed_flag"
    assert mapping["Note"] == "notes"
    assert mapping["Tags"] == "tags"
    assert mapping["MPG"] is None  # computed column, correctly left unmapped


# ---- API flow ----

FUEL_CSV = """Date,Miles,Gallons,Price,Octane,Fuel Brand,Partial Fill-Up,Note
7/1/2026,1000,10.0,$3.29,87,North Fuel Stop,,first
7/8/2026,1250,5.0,$3.35,87,,x,topped off
7/15/2026,1500,11.2,$3.29,87,Hilltop Gas,,
bad-date,1600,10,3.30,87,,,
7/15/2026,1500,11.2,$3.29,87,,,duplicate row
"""


def make_vehicle(client) -> dict:
    return client.post("/api/vehicles", json={"name": "Truck", "energy_type": "gasoline"}).json()


def run_import(client, vehicle_id, csv_text, kind="fuelups", tweak_mapping=None):
    preview = client.post(
        f"/api/vehicles/{vehicle_id}/import/preview?kind={kind}",
        files={"file": ("export.csv", csv_text.encode(), "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    mapping = body["suggested_mapping"]
    if tweak_mapping:
        mapping.update(tweak_mapping)
    result = client.post(
        f"/api/vehicles/{vehicle_id}/import",
        json={"token": body["token"], "kind": kind, "mapping": mapping},
    )
    assert result.status_code == 200, result.text
    return body, result.json()


def test_fuelup_import_end_to_end(client):
    do_setup(client)
    vehicle = make_vehicle(client)

    preview, result = run_import(client, vehicle["id"], FUEL_CSV)
    assert preview["row_count"] == 5
    assert result["created"] == 3
    assert result["skipped_duplicates"] == 1
    assert len(result["errors"]) == 1 and "row 5" in result["errors"][0]

    fuelups = client.get(f"/api/vehicles/{vehicle['id']}/fuelups").json()
    assert len(fuelups) == 3
    newest = fuelups[0]
    assert newest["odometer"] == 1500
    # partial flag came through and the economy chain accumulates it
    assert newest["economy"] is not None
    assert newest["distance"] == 500
    partial = next(f for f in fuelups if f["odometer"] == 1250)
    assert partial["fill_type"] == "partial"
    # price completion ran on import
    assert newest["total_cost"] is not None


def test_import_older_history_flags_gap_entry_as_missed(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    # existing entries logged first, starting thousands of miles after the CSV ends
    client.post(
        f"/api/vehicles/{vehicle['id']}/fuelups",
        json={"date": "2026-08-01T12:00:00", "odometer": 84850, "volume": 12.4},
    )
    client.post(
        f"/api/vehicles/{vehicle['id']}/fuelups",
        json={"date": "2026-08-08T12:00:00", "odometer": 85090, "volume": 12},
    )

    _, result = run_import(client, vehicle["id"], FUEL_CSV)
    assert result["created"] == 3
    assert len(result["notes"]) == 1 and "missed fill" in result["notes"][0]

    fuelups = client.get(f"/api/vehicles/{vehicle['id']}/fuelups").json()
    bridge = next(f for f in fuelups if f["odometer"] == 84850)
    assert bridge["fill_type"] == "missed"
    assert bridge["economy"] is None  # no bogus 300-MPG number
    after = next(f for f in fuelups if f["odometer"] == 85090)
    assert after["economy"] is not None  # chain restarts honestly


def test_import_continuous_history_is_not_flagged(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    # existing entry continues right where the CSV ends (1500 + a normal tank)
    client.post(
        f"/api/vehicles/{vehicle['id']}/fuelups",
        json={"date": "2026-07-22T12:00:00", "odometer": 1760, "volume": 10.4},
    )
    _, result = run_import(client, vehicle["id"], FUEL_CSV)
    assert result["notes"] == []
    fuelups = client.get(f"/api/vehicles/{vehicle['id']}/fuelups").json()
    bridge = next(f for f in fuelups if f["odometer"] == 1760)
    assert bridge["fill_type"] == "full"
    assert bridge["economy"] is not None


def test_preview_respects_chosen_kind(client):
    """The user's Fuel-ups / Service records choice is authoritative: a service
    import never asks for fuel columns, and the kind is never switched."""
    do_setup(client)
    vehicle = make_vehicle(client)
    preview = client.post(
        f"/api/vehicles/{vehicle['id']}/import/preview?kind=services",
        files={"file": ("services.csv", SERVICE_CSV.encode(), "text/csv")},
    ).json()
    assert preview["kind"] == "services"
    assert "volume" not in preview["fields"]
    assert preview["suggested_mapping"]["Service"] == "service_type"

    # even a fuel-shaped file stays "services" when that's what was chosen
    preview = client.post(
        f"/api/vehicles/{vehicle['id']}/import/preview?kind=services",
        files={"file": ("fuel.csv", FUEL_CSV.encode(), "text/csv")},
    ).json()
    assert preview["kind"] == "services"
    assert "volume" not in preview["fields"]


def test_import_requires_required_columns(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    preview = client.post(
        f"/api/vehicles/{vehicle['id']}/import/preview?kind=fuelups",
        files={"file": ("x.csv", b"Date,Price\n7/1/2026,3.29\n", "text/csv")},
    ).json()
    result = client.post(
        f"/api/vehicles/{vehicle['id']}/import",
        json={"token": preview["token"], "kind": "fuelups", "mapping": preview["suggested_mapping"]},
    )
    assert result.status_code == 422
    assert "odometer" in result.json()["detail"]


SERVICE_CSV = """Date,Odometer,Service,Cost,Shop,Notes
2026-05-01,82000,"Oil change, Tire rotation",114.99,Main Street Auto,spring service
2026-06-15,83500,Brakes,412.50,,
"""


def test_service_import(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    _, result = run_import(client, vehicle["id"], SERVICE_CSV, kind="services")
    assert result["created"] == 2
    services = client.get(f"/api/vehicles/{vehicle['id']}/services").json()
    assert len(services) == 2
    visit = next(s for s in services if s["total_cost"] == 114.99)
    assert sorted(i["service_type"] for i in visit["items"]) == ["Oil change", "Tire rotation"]


def test_import_scoped_to_owner(make_client):
    client = make_client(allow_registration=True)
    do_setup(client)
    vehicle = make_vehicle(client)
    client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "display_name": "Other"},
    )
    response = client.post(
        f"/api/vehicles/{vehicle['id']}/import/preview?kind=fuelups",
        files={"file": ("x.csv", FUEL_CSV.encode(), "text/csv")},
    )
    assert response.status_code == 404


def test_json_export_roundtrip(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    run_import(client, vehicle["id"], FUEL_CSV)
    client.post(
        f"/api/vehicles/{vehicle['id']}/services",
        json={"date": "2026-05-01T12:00:00", "items": [{"service_type": "Oil change", "cost": 90}]},
    )

    response = client.get("/api/export/json")
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    data = json.loads(response.content)
    assert data["app"] == "Pitstop"
    assert len(data["vehicles"]) == 1
    assert len(data["fuelups"]) == 3
    assert len(data["service_records"]) == 1
    assert data["service_records"][0]["items"][0]["service_type"] == "Oil change"


def test_csv_export_zip(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    run_import(client, vehicle["id"], FUEL_CSV)

    response = client.get("/api/export/csv")
    assert response.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = set(archive.namelist())
    assert {"vehicles.csv", "fuelups.csv", "service_records.csv"} <= names
    fuelups_csv = archive.read("fuelups.csv").decode("utf-8-sig")
    assert "odometer" in fuelups_csv.splitlines()[0]
    assert len([l for l in fuelups_csv.splitlines() if l.strip()]) == 4  # header + 3 rows
