"""Seguimiento de importaciones Excel dentro de este proceso.

Los datos importados se guardan en SQLite. El progreso es temporal:
si se reinicia el servidor, se debe revisar el lote desde la vista previa.
"""
import copy
import logging
import threading
import time
import uuid

_LOCK = threading.Lock()
_JOBS = {}
TTL_SECONDS = 3600


class ImportBusy(ValueError):
    pass


def start(actor, target_id, task):
    timestamp = time.time()

    with _LOCK:
        expired = [
            key for key, job in _JOBS.items()
            if job["state"] in ("done", "error")
            and timestamp - job["updated"] > TTL_SECONDS
        ]
        for key in expired:
            del _JOBS[key]

        if any(job["state"] in ("queued", "running") for job in _JOBS.values()):
            raise ImportBusy(
                "Ya hay una importación Excel en marcha. Espera a que termine."
            )

        job_id = uuid.uuid4().hex
        _JOBS[job_id] = {
            "id": job_id,
            "actorId": actor["id"],
            "targetId": target_id,
            "state": "queued",
            "progress": {
                "stage": "queued",
                "label": "Esperando para empezar",
                "done": 0,
                "total": 0,
                "percent": 0,
            },
            "result": None,
            "error": None,
            "updated": timestamp,
        }

    def update(progress):
        with _LOCK:
            job = _JOBS.get(job_id)
            if job is not None:
                job["progress"] = dict(progress)
                job["updated"] = time.time()

    def worker():
        with _LOCK:
            _JOBS[job_id]["state"] = "running"

        try:
            result = task(update)
        except Exception as exc:
            logging.exception("La importación Excel no ha podido completarse")
            with _LOCK:
                _JOBS[job_id]["state"] = "error"
                _JOBS[job_id]["error"] = str(exc)[:1500]
                _JOBS[job_id]["updated"] = time.time()
        else:
            with _LOCK:
                _JOBS[job_id]["state"] = "done"
                _JOBS[job_id]["result"] = result
                _JOBS[job_id]["progress"] = {
                    "stage": "done",
                    "label": "Importación guardada",
                    "done": 1,
                    "total": 1,
                    "percent": 100,
                }
                _JOBS[job_id]["updated"] = time.time()

    threading.Thread(
        target=worker,
        name=f"atlas-excel-{job_id[:8]}",
        daemon=True,
    ).start()

    return {"jobId": job_id}


def status(job_id, user):
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            raise KeyError(job_id)

        if (
            user["id"] not in (job["actorId"], job["targetId"])
            and not user.get("isOwner")
        ):
            raise PermissionError("No puedes consultar esta importación.")

        return copy.deepcopy({
            "state": job["state"],
            "progress": job["progress"],
            "result": job["result"],
            "error": job["error"],
        })
