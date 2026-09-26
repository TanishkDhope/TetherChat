import inspect
from llama_cpp import Llama
print(inspect.signature(Llama.create_completion))
