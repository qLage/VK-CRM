import argparse
import sys
from typing import List, Optional

try:
    import paramiko
except Exception:
    print("Missing dependency: paramiko. Install with: pip install paramiko")
    sys.exit(1)


DEFAULT_SERVICE_CANDIDATES = ["frontend", "front", "web", "client", "app"]


def run_cmd(ssh: "paramiko.SSHClient", command: str, check: bool = True) -> str:
    print(f"\n$ {command}")
    stdin, stdout, stderr = ssh.exec_command(command)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    exit_code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())
    if check and exit_code != 0:
        raise RuntimeError(f"Command failed with exit code {exit_code}: {command}")
    return out


def choose_service(services: List[str], explicit: Optional[str]) -> str:
    if explicit:
        if explicit in services:
            return explicit
        raise RuntimeError(f"Service '{explicit}' is not in compose services: {services}")

    for candidate in DEFAULT_SERVICE_CANDIDATES:
        if candidate in services:
            return candidate

    raise RuntimeError(
        "Could not auto-detect frontend service. "
        f"Available services: {services}. "
        "Pass --service explicitly."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Deploy frontend service over SSH")
    parser.add_argument("--host", required=True, help="Server host or IP")
    parser.add_argument("--user", required=True, help="SSH username")
    parser.add_argument("--password", required=True, help="SSH password")
    parser.add_argument("--service", default=None, help="Compose service name (optional)")
    parser.add_argument("--port", type=int, default=22, help="SSH port")
    args = parser.parse_args()

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    print(f"Connecting to {args.user}@{args.host}:{args.port} ...")
    ssh.connect(
        hostname=args.host,
        port=args.port,
        username=args.user,
        password=args.password,
        timeout=20,
        auth_timeout=20,
        banner_timeout=20,
    )
    print("Connected.")

    try:
        run_cmd(ssh, "hostname")
        run_cmd(ssh, "docker ps --format 'table {{.Names}}\\t{{.Image}}\\t{{.Ports}}'")

        project_dir = run_cmd(
            ssh,
            "sh -lc \"find / -maxdepth 5 -name docker-compose.yml 2>/dev/null | head -n 1 | xargs dirname\"",
        ).strip()
        if not project_dir:
            raise RuntimeError("Could not find docker-compose.yml on server")
        print(f"Detected project directory: {project_dir}")

        run_cmd(ssh, f"sh -lc 'cd \"{project_dir}\" && git pull || true'")
        services_raw = run_cmd(ssh, f"sh -lc 'cd \"{project_dir}\" && docker compose config --services'")
        services = [s.strip() for s in services_raw.splitlines() if s.strip()]
        if not services:
            raise RuntimeError("No services returned by docker compose config --services")

        service = choose_service(services, args.service)
        print(f"Selected frontend service: {service}")

        run_cmd(ssh, f"sh -lc 'cd \"{project_dir}\" && docker compose build {service}'")
        run_cmd(ssh, f"sh -lc 'cd \"{project_dir}\" && docker compose up -d {service}'")
        run_cmd(ssh, f"sh -lc 'cd \"{project_dir}\" && docker compose ps'")
        run_cmd(ssh, f"docker logs --tail=120 {service}", check=False)

        print("\nDeploy completed.")
        return 0
    finally:
        ssh.close()


if __name__ == "__main__":
    raise SystemExit(main())
