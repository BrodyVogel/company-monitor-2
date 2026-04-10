import requests
import sys

r = requests.post('http://localhost:8000/api/import', files={'file': open(sys.argv[1], 'rb')})
print(r.status_code, r.json())
