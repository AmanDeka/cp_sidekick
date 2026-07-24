import java.util.*;
import java.io.*;

public class Main {

    static BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    static PrintWriter out = new PrintWriter(new BufferedOutputStream(System.out));
    static StringTokenizer st;

    static String next() throws IOException {
        while (st == null || !st.hasMoreTokens())
            st = new StringTokenizer(br.readLine());
        return st.nextToken();
    }
    static int nextInt() throws IOException { return Integer.parseInt(next()); }
    static long nextLong() throws IOException { return Long.parseLong(next()); }
    static double nextDouble() throws IOException { return Double.parseDouble(next()); }

    static void debug(Object... args) {
        if (System.getenv("LOCAL") != null) {
            StringBuilder sb = new StringBuilder("[DEBUG]");
            for (Object o : args) sb.append(' ').append(o);
            System.err.println(sb);
        }
    }

    static void solve() throws IOException {

    }

    public static void main(String[] args) throws IOException {
        if (System.getenv("LOCAL") != null) {
            br = new BufferedReader(new FileReader("input.txt"));
            out = new PrintWriter(new FileWriter("output.txt"));
        }

        int t = 1;
        // t = nextInt();  // uncomment for multiple test cases
        while (t-- > 0) {
            solve();
        }

        out.flush();
        out.close();
    }
}
