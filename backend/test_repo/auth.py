from database import connect


def login(username):
    connect()
    print("Logged in:", username)