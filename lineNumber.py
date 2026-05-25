import pyperclip

# 在这里调整两个数字
start = 701
end = 900

# 生成数列(包含 start 和 end)
numbers = "\n".join(str(i) for i in range(start, end + 1))

# 复制到剪贴板
pyperclip.copy(numbers)

print(f"已将 {start} 到 {end} 的数列复制到剪贴板:")
print(numbers)
