# 将生成start到end的数列(包含start和end),使用\n分割,并将结果自动复制到剪切板

# 在这里调整两个数字
start = 701
end = 900

import pyperclip

# 生成数列(包含 start 和 end)
numbers = "\n".join(str(i) for i in range(start, end + 1))

# 复制到剪贴板
pyperclip.copy(numbers)

print(f"已将 {start} 到 {end} 的数列复制到剪贴板:")
print(numbers)
