import sqlalchemy.types as types
from app.core.encryption import encrypt_data, decrypt_data

class EncryptedString(types.TypeDecorator):
    """
    Encrypts string data on the way in, decrypts on the way out.
    """
    impl = types.String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        return encrypt_data(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        return decrypt_data(value)
